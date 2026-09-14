import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError } from '../../common/errors';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { TIMESHEET_REPOSITORY } from './attendance.tokens';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';

import { toId, type EmployeeId, type IsoDate, type TimesheetId, type UserId } from '@hrms/shared';

const toAmount = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

type OpenTimesheetData = {
  readonly employeeId: EmployeeId;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
};

// The timesheet lifecycle: open -> submitted -> approved -> locked. `submitted`
// rolls up TimeEntry hours; `locked` is the immutable handoff to Payroll
// (plan.md §5.2). Both transitions announce on the transactional outbox.
@Injectable()
export class TimesheetService {
  constructor(
    @Inject(TIMESHEET_REPOSITORY) private readonly timesheets: TenantScopedRepository<Timesheet>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
  ) {}

  open(input: OpenTimesheetData): Promise<Timesheet> {
    const timesheet = this.timesheets.create({
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'open',
      totalHours: '0',
      submittedByUserId: null,
      approvedByUserId: null,
    });
    return this.timesheets.save(timesheet);
  }

  listForEmployee(employeeId: EmployeeId): Promise<Timesheet[]> {
    return this.timesheets.find({ where: { employeeId } as FindOptionsWhere<Timesheet> });
  }

  async submit(timesheetId: string, submittedByUserId: UserId): Promise<Timesheet> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const timesheet = await manager.findOne(Timesheet, {
        where: { id: timesheetId, organizationId },
      });
      if (!timesheet) {
        throw new NotFoundError('Timesheet not found', { id: timesheetId });
      }
      if (timesheet.status !== 'open') {
        throw new ConflictError('Timesheet is not open', { status: timesheet.status });
      }
      const entries = await manager.find(TimeEntry, {
        where: {
          organizationId,
          employeeId: timesheet.employeeId,
          date: Between(timesheet.periodStart, timesheet.periodEnd),
        },
      });
      const total = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
      timesheet.totalHours = toAmount(total);
      timesheet.status = 'submitted';
      timesheet.submittedByUserId = submittedByUserId;
      const saved = await manager.save(timesheet);

      await this.publisher.publishWithin(manager, {
        name: 'timesheet.submitted',
        payload: {
          timesheetId: toId<TimesheetId>(saved.id),
          employeeId: timesheet.employeeId,
          periodStart: timesheet.periodStart,
          periodEnd: timesheet.periodEnd,
        },
      });
      return saved;
    });
  }

  async approve(timesheetId: string, approvedByUserId: UserId): Promise<Timesheet> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const timesheet = await manager.findOne(Timesheet, {
        where: { id: timesheetId, organizationId },
      });
      if (!timesheet) {
        throw new NotFoundError('Timesheet not found', { id: timesheetId });
      }
      if (timesheet.status !== 'submitted') {
        throw new ConflictError('Timesheet is not submitted', { status: timesheet.status });
      }
      timesheet.status = 'approved';
      timesheet.approvedByUserId = approvedByUserId;
      return manager.save(timesheet);
    });
  }

  async lock(timesheetId: string): Promise<Timesheet> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const timesheet = await manager.findOne(Timesheet, {
        where: { id: timesheetId, organizationId },
      });
      if (!timesheet) {
        throw new NotFoundError('Timesheet not found', { id: timesheetId });
      }
      if (timesheet.status !== 'approved') {
        throw new ConflictError('Timesheet must be approved before locking', {
          status: timesheet.status,
        });
      }
      timesheet.status = 'locked';
      const saved = await manager.save(timesheet);

      await this.publisher.publishWithin(manager, {
        name: 'timesheet.locked',
        payload: {
          timesheetId: toId<TimesheetId>(saved.id),
          employeeId: timesheet.employeeId,
          periodStart: timesheet.periodStart,
          periodEnd: timesheet.periodEnd,
          totalHours: Number(saved.totalHours),
        },
      });
      return saved;
    });
  }
}
