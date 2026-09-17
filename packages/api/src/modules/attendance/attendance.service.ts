import type { EmployeeId, IsoDate } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, LessThanOrEqual, MoreThanOrEqual, type FindOptionsWhere } from 'typeorm';

import { ConflictError } from '../../common/errors';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { attendanceLockKey } from './attendance-lock';
import { TIME_ENTRY_REPOSITORY } from './attendance.tokens';
import { ClockEvent, type ClockSource } from './entities/clock-event.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';


const MILLISECONDS_PER_HOUR = 3_600_000;
const toAmount = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

type RecordTimeEntryData = {
  readonly employeeId: EmployeeId;
  readonly date: IsoDate;
  readonly hours: number;
  readonly note?: string | null;
};

// Clock punches and worked-hours entries. Clock-out pairs with the open clock-in
// and reduces the pair to a TimeEntry — the unit timesheets sum.
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(TIME_ENTRY_REPOSITORY) private readonly timeEntries: TenantScopedRepository<TimeEntry>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async clockIn(
    employeeId: EmployeeId,
    occurredAt?: string,
    source: ClockSource = 'web',
  ): Promise<ClockEvent> {
    const organizationId = this.tenantContext.getOrganizationId();
    const at = occurredAt ? new Date(occurredAt) : new Date();
    return this.dataSource.transaction(async (manager) => {
      // Serialize punches per employee: two concurrent clock-ins must not both
      // see the last event as `out` and leave two open punches.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        attendanceLockKey(organizationId, employeeId),
      ]);
      const last = await manager.findOne(ClockEvent, {
        where: { organizationId, employeeId },
        order: { occurredAt: 'DESC' },
      });
      if (last?.type === 'in') {
        throw new ConflictError('Already clocked in — clock out before clocking in again', {
          employeeId,
        });
      }
      if (last && at.getTime() <= last.occurredAt.getTime()) {
        throw new ConflictError('clock-in must be after the last clock event', {
          employeeId,
          lastOccurredAt: last.occurredAt.toISOString(),
        });
      }
      const event = manager.create(ClockEvent, {
        organizationId,
        employeeId,
        type: 'in',
        occurredAt: at,
        source,
      });
      return manager.save(event);
    });
  }

  // Close the open clock-in and reduce the session to a TimeEntry, atomically.
  async clockOut(
    employeeId: EmployeeId,
    occurredAt?: string,
    source: ClockSource = 'web',
  ): Promise<TimeEntry> {
    const organizationId = this.tenantContext.getOrganizationId();
    const at = occurredAt ? new Date(occurredAt) : new Date();
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        attendanceLockKey(organizationId, employeeId),
      ]);
      const last = await manager.findOne(ClockEvent, {
        where: { organizationId, employeeId },
        order: { occurredAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!last || last.type === 'out') {
        throw new ConflictError('No open clock-in to close for this employee');
      }
      // Out-of-order punches would produce negative hours.
      if (at.getTime() <= last.occurredAt.getTime()) {
        throw new ConflictError('clock-out must be after the open clock-in', {
          employeeId,
          clockedInAt: last.occurredAt.toISOString(),
        });
      }
      const outEvent = manager.create(ClockEvent, {
        organizationId,
        employeeId,
        type: 'out',
        occurredAt: at,
        source,
      });
      await manager.save(outEvent);

      const hours = (at.getTime() - last.occurredAt.getTime()) / MILLISECONDS_PER_HOUR;
      const entryDate = at.toISOString().slice(0, 10) as IsoDate;
      // A clock-generated entry must not land in a period whose timesheet is
      // already locked; the shared advisory lock keeps this check and the lock
      // step from interleaving.
      const locked = await manager.findOne(Timesheet, {
        where: {
          organizationId,
          employeeId,
          status: 'locked',
          periodStart: LessThanOrEqual(entryDate),
          periodEnd: MoreThanOrEqual(entryDate),
        } as FindOptionsWhere<Timesheet>,
      });
      if (locked) {
        throw new ConflictError('The period is locked; clock entries cannot be added', {
          timesheetId: locked.id,
          date: entryDate,
        });
      }
      const entry = manager.create(TimeEntry, {
        organizationId,
        employeeId,
        timesheetId: null,
        date: entryDate,
        hours: toAmount(hours),
        source: 'clock',
        note: null,
      });
      return manager.save(entry);
    });
  }

  // Manual hours cannot land in a locked period: locking freezes the timesheet's
  // entries, so a new entry would silently change a document Payroll consumed.
  async recordEntry(input: RecordTimeEntryData): Promise<TimeEntry> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      // Same lock as timesheet open/lock and punches: the locked-period check
      // and the insert cannot interleave with a freeze.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        attendanceLockKey(organizationId, input.employeeId),
      ]);
      const locked = await manager.findOne(Timesheet, {
        where: {
          organizationId,
          employeeId: input.employeeId,
          status: 'locked',
          periodStart: LessThanOrEqual(input.date),
          periodEnd: MoreThanOrEqual(input.date),
        } as FindOptionsWhere<Timesheet>,
      });
      if (locked) {
        throw new ConflictError('The period is locked; its timesheet cannot change', {
          timesheetId: locked.id,
          date: input.date,
        });
      }
      const entry = manager.create(TimeEntry, {
        organizationId,
        employeeId: input.employeeId,
        timesheetId: null,
        date: input.date,
        hours: toAmount(input.hours),
        source: 'manual',
        note: input.note ?? null,
      });
      return manager.save(entry);
    });
  }

  listEntries(employeeId: EmployeeId, from: IsoDate, to: IsoDate): Promise<TimeEntry[]> {
    return this.timeEntries.find({
      where: { employeeId, date: Between(from, to) } as FindOptionsWhere<TimeEntry>,
    });
  }
}
