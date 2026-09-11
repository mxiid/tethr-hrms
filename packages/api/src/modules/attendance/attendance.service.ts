import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, type FindOptionsWhere } from 'typeorm';

import { ConflictError } from '../../common/errors';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { CLOCK_EVENT_REPOSITORY, TIME_ENTRY_REPOSITORY } from './attendance.tokens';
import { ClockEvent, type ClockSource } from './entities/clock-event.entity';
import { TimeEntry } from './entities/time-entry.entity';

import type { EmployeeId, IsoDate } from '@hrms/shared';

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
    @Inject(CLOCK_EVENT_REPOSITORY) private readonly clockEvents: TenantScopedRepository<ClockEvent>,
    @Inject(TIME_ENTRY_REPOSITORY) private readonly timeEntries: TenantScopedRepository<TimeEntry>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  clockIn(employeeId: EmployeeId, occurredAt?: string, source: ClockSource = 'web'): Promise<ClockEvent> {
    const event = this.clockEvents.create({
      employeeId,
      type: 'in',
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      source,
    });
    return this.clockEvents.save(event);
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
      const last = await manager.findOne(ClockEvent, {
        where: { organizationId, employeeId },
        order: { occurredAt: 'DESC' },
      });
      if (!last || last.type === 'out') {
        throw new ConflictError('No open clock-in to close for this employee');
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
      const entry = manager.create(TimeEntry, {
        organizationId,
        employeeId,
        date: at.toISOString().slice(0, 10),
        hours: toAmount(hours),
        source: 'clock',
        note: null,
      });
      return manager.save(entry);
    });
  }

  recordEntry(input: RecordTimeEntryData): Promise<TimeEntry> {
    const entry = this.timeEntries.create({
      employeeId: input.employeeId,
      date: input.date,
      hours: toAmount(input.hours),
      source: 'manual',
      note: input.note ?? null,
    });
    return this.timeEntries.save(entry);
  }

  listEntries(employeeId: EmployeeId, from: IsoDate, to: IsoDate): Promise<TimeEntry[]> {
    return this.timeEntries.find({
      where: { employeeId, date: Between(from, to) } as FindOptionsWhere<TimeEntry>,
    });
  }
}
