import {
  compareIsoDate,
  countWorkingDays,
  toId,
  type EmployeeId,
  type HolidayCalendarId,
  type IsoDate,
  type LeaveRequestId,
  type LeaveTypeId,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { WorkflowService } from '../../core/workflow/workflow.service';
import { EmployeeDirectoryService } from '../employee/employee-directory.service';

import { EmployeeLeaveEntitlementService } from './employee-leave-entitlement.service';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';
import { HolidayService } from './holiday.service';
import { LEAVE_REQUEST_REPOSITORY, LEAVE_TYPE_REPOSITORY } from './leave.tokens';

type SubmitLeaveRequestData = {
  readonly employeeId: EmployeeId;
  readonly leaveTypeId: LeaveTypeId;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly reason?: string | null;
  readonly holidayCalendarId?: HolidayCalendarId | null;
  readonly requestedByUserId?: UserId | null;
};

// Day amounts: parse the numeric-as-string column and round to 2 dp so repeated
// add/subtract can't accumulate float error.
const toNumber = (value: string): number => Number(value);
const toAmount = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

const isUniqueViolation = (cause: unknown): boolean => {
  const driverError = (cause as { readonly driverError?: { readonly code?: string } }).driverError;
  return (driverError?.code ?? (cause as { readonly code?: string }).code) === '23505';
};

// Split a request's working days by calendar year (D2): years partition the
// range, so the parts always sum to the whole range's working-day count.
const splitWorkingDaysByYear = (
  startDate: IsoDate,
  endDate: IsoDate,
  holidays: ReadonlySet<IsoDate>,
): readonly { readonly year: number; readonly days: number }[] => {
  const allocations: { year: number; days: number }[] = [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = `${year}-01-01` as IsoDate;
    const yearEnd = `${year}-12-31` as IsoDate;
    const clipStart = compareIsoDate(startDate, yearStart) > 0 ? startDate : yearStart;
    const clipEnd = compareIsoDate(endDate, yearEnd) < 0 ? endDate : yearEnd;
    if (compareIsoDate(clipStart, clipEnd) > 0) {
      continue;
    }
    const days = countWorkingDays(clipStart, clipEnd, holidays);
    if (days > 0) {
      allocations.push({ year, days });
    }
  }
  return allocations;
};

// Owns the leave-request lifecycle: cost the request in working days, reserve and
// settle balance, route approval through the shared workflow engine, and announce
// each transition on the transactional outbox (leave.approved feeds Payroll later).
@Injectable()
export class LeaveRequestService {
  constructor(
    @Inject(LEAVE_REQUEST_REPOSITORY)
    private readonly requests: TenantScopedRepository<LeaveRequest>,
    @Inject(LEAVE_TYPE_REPOSITORY) private readonly leaveTypes: TenantScopedRepository<LeaveType>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly holidayService: HolidayService,
    private readonly workflowService: WorkflowService,
    private readonly entitlementService: EmployeeLeaveEntitlementService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly audit: AuditService,
  ) {}

  async submit(input: SubmitLeaveRequestData): Promise<LeaveRequest> {
    if (compareIsoDate(input.startDate, input.endDate) > 0) {
      throw new ValidationFailedError('startDate must be on or before endDate');
    }
    if (!(await this.employeeDirectory.exists(input.employeeId))) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    const leaveType = await this.leaveTypes.findById(input.leaveTypeId);
    if (!leaveType) {
      throw new NotFoundError('Leave type not found', { id: input.leaveTypeId });
    }

    const holidays = input.holidayCalendarId
      ? await this.holidayService.getHolidayDates(
          input.holidayCalendarId,
          input.startDate,
          input.endDate,
        )
      : new Set<IsoDate>();
    const allocations = splitWorkingDaysByYear(input.startDate, input.endDate, holidays);
    const dayCount = allocations.reduce((sum, allocation) => sum + allocation.days, 0);
    if (dayCount <= 0) {
      throw new ValidationFailedError('Requested range contains no working days');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const fallbackEntitlement = Number(leaveType.defaultAnnualEntitlement);

    const saved = await this.dataSource.transaction(async (manager) => {
      // Per D2, reserve each calendar year's balance for its own slice. The
      // balance row is locked before the read-modify-write, so concurrent
      // submits cannot oversubscribe it.
      for (const allocation of allocations) {
        const yearStart = `${allocation.year}-01-01` as IsoDate;
        const entitlement = await this.entitlementService.resolveEntitlement(
          input.employeeId,
          input.leaveTypeId,
          fallbackEntitlement,
          compareIsoDate(input.startDate, yearStart) > 0 ? input.startDate : yearStart,
        );
        const balance = await this.getOrCreateBalance(
          manager,
          organizationId,
          input.employeeId,
          input.leaveTypeId,
          allocation.year,
          entitlement.toFixed(2),
        );
        const available =
          toNumber(balance.entitledDays) -
          toNumber(balance.usedDays) -
          toNumber(balance.pendingDays);
        if (allocation.days > available) {
          throw new ValidationFailedError('Insufficient leave balance', {
            periodYear: allocation.year,
            available,
            requested: allocation.days,
          });
        }
        balance.pendingDays = toAmount(toNumber(balance.pendingDays) + allocation.days);
        await manager.save(balance);
      }

      const request = manager.create(LeaveRequest, {
        organizationId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        dayCount: toAmount(dayCount),
        yearAllocations: allocations,
        reason: input.reason ?? null,
        status: 'pending',
        approvalRequestId: null,
        decidedByUserId: null,
        decisionNote: null,
      });
      const persisted = await manager.save(request);

      // Approval request + link in the same transaction: a pending request
      // always has its approval row, and a rolled-back request never leaves an
      // orphan approval behind.
      if (leaveType.requiresApproval && input.requestedByUserId) {
        const approval = await this.workflowService.requestApproval(
          {
            subjectType: 'leave_request',
            subjectId: persisted.id,
            requestedByUserId: input.requestedByUserId,
          },
          manager,
        );
        persisted.approvalRequestId = approval.id;
        await manager.save(persisted);
      }

      await this.publisher.publishWithin(manager, {
        name: 'leave.requested',
        payload: {
          leaveRequestId: toId<LeaveRequestId>(persisted.id),
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: input.startDate,
          endDate: input.endDate,
          dayCount,
        },
      });
      return persisted;
    });

    await this.audit.record({
      action: 'submit',
      resourceType: 'leave_request',
      resourceId: saved.id,
      after: { dayCount, status: saved.status },
    });
    return saved;
  }

  approve(id: string, decidedByUserId: UserId, note?: string): Promise<LeaveRequest> {
    return this.decide(id, 'approved', decidedByUserId, note);
  }

  reject(id: string, decidedByUserId: UserId, note?: string): Promise<LeaveRequest> {
    return this.decide(id, 'rejected', decidedByUserId, note);
  }

  // Cancellation by the requester — no decider, releases the reservation.
  cancel(id: string): Promise<LeaveRequest> {
    return this.decide(id, 'cancelled', null);
  }

  listForEmployee(employeeId: EmployeeId): Promise<LeaveRequest[]> {
    return this.requests.find({ where: { employeeId } as FindOptionsWhere<LeaveRequest> });
  }

  listAll(): Promise<LeaveRequest[]> {
    return this.requests.find({ order: { startDate: 'DESC', createdAt: 'DESC' } });
  }

  // Published read for Payroll: approved UNPAID leave touching [from, to], counted
  // in working days after clipping the request to that window (holidays supplied by
  // the caller so run and leave math share one calendar). Storage stays private to
  // this module — payroll never queries these tables itself.
  async getApprovedUnpaidWorkDays(
    employeeId: EmployeeId,
    from: IsoDate,
    to: IsoDate,
    holidays: ReadonlySet<IsoDate> = new Set(),
  ): Promise<number> {
    if (compareIsoDate(from, to) > 0) {
      return 0;
    }
    const approved = await this.requests.find({
      where: { employeeId, status: 'approved' } as FindOptionsWhere<LeaveRequest>,
    });
    const overlapping = approved.filter(
      (request) => compareIsoDate(request.startDate, to) <= 0 && compareIsoDate(request.endDate, from) >= 0,
    );
    if (overlapping.length === 0) {
      return 0;
    }
    const types = await this.leaveTypes.find();
    const unpaidTypeIds = new Set(types.filter((leaveType) => !leaveType.paid).map((t) => t.id));
    let unpaidDays = 0;
    for (const request of overlapping) {
      if (!unpaidTypeIds.has(request.leaveTypeId)) continue;
      const clippedStart = compareIsoDate(request.startDate, from) > 0 ? request.startDate : from;
      const clippedEnd = compareIsoDate(request.endDate, to) < 0 ? request.endDate : to;
      unpaidDays += countWorkingDays(clippedStart, clippedEnd, holidays);
    }
    return unpaidDays;
  }

  private async decide(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    decidedByUserId: UserId | null,
    note?: string,
  ): Promise<LeaveRequest> {
    const organizationId = this.tenantContext.getOrganizationId();
    const updated = await this.dataSource.transaction(async (manager) => {
      // Lock the request: two concurrent decisions must not both release the
      // pending reservation.
      const request = await manager.findOne(LeaveRequest, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        throw new NotFoundError('Leave request not found', { id });
      }
      if (request.status !== 'pending') {
        throw new ConflictError('Leave request is not pending', { status: request.status });
      }

      const days = toNumber(request.dayCount);
      // D2: release/spend exactly what each year reserved. Legacy rows predate
      // the split and hold everything on the start year.
      const allocations =
        request.yearAllocations.length > 0
          ? request.yearAllocations
          : [{ year: Number(request.startDate.slice(0, 4)), days }];

      for (const allocation of allocations) {
        const balance = await manager.findOne(LeaveBalance, {
          where: {
            organizationId,
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            periodYear: allocation.year,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (balance) {
          // Always release the pending reservation; on approval, spend it.
          balance.pendingDays = toAmount(
            Math.max(0, toNumber(balance.pendingDays) - allocation.days),
          );
          if (status === 'approved') {
            balance.usedDays = toAmount(toNumber(balance.usedDays) + allocation.days);
          }
          await manager.save(balance);
        }
      }

      // Keep the shared workflow row in step: a decided request must not leave
      // its approval_requests row pending forever.
      if (request.approvalRequestId) {
        await this.workflowService.decide(
          request.approvalRequestId,
          decidedByUserId,
          status,
          note,
          manager,
        );
      }

      request.status = status;
      request.decidedByUserId = decidedByUserId;
      request.decisionNote = note ?? null;
      const persisted = await manager.save(request);

      if (status === 'approved') {
        await this.publisher.publishWithin(manager, {
          name: 'leave.approved',
          payload: {
            leaveRequestId: toId<LeaveRequestId>(persisted.id),
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            startDate: request.startDate,
            endDate: request.endDate,
            dayCount: days,
          },
        });
      } else if (status === 'rejected') {
        await this.publisher.publishWithin(manager, {
          name: 'leave.rejected',
          payload: {
            leaveRequestId: toId<LeaveRequestId>(persisted.id),
            employeeId: request.employeeId,
          },
        });
      } else {
        await this.publisher.publishWithin(manager, {
          name: 'leave.cancelled',
          payload: {
            leaveRequestId: toId<LeaveRequestId>(persisted.id),
            employeeId: request.employeeId,
          },
        });
      }
      return persisted;
    });

    await this.audit.record({
      action: status,
      resourceType: 'leave_request',
      resourceId: updated.id,
      after: { status },
    });
    return updated;
  }

  private async getOrCreateBalance(
    manager: EntityManager,
    organizationId: OrganizationId,
    employeeId: EmployeeId,
    leaveTypeId: LeaveTypeId,
    periodYear: number,
    entitledDays: string,
  ): Promise<LeaveBalance> {
    const existing = await manager.findOne(LeaveBalance, {
      where: { organizationId, employeeId, leaveTypeId, periodYear },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return existing;
    }
    try {
      // Savepoint: a concurrent creator's unique-index win must not poison the
      // surrounding transaction — the locked read below then sees their row.
      await manager.transaction((inner) =>
        inner.save(
          inner.create(LeaveBalance, {
            organizationId,
            employeeId,
            leaveTypeId,
            periodYear,
            entitledDays,
            usedDays: '0',
            pendingDays: '0',
          }),
        ),
      );
    } catch (cause) {
      if (!isUniqueViolation(cause)) {
        throw cause;
      }
    }
    const locked = await manager.findOne(LeaveBalance, {
      where: { organizationId, employeeId, leaveTypeId, periodYear },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) {
      throw new ConflictError('Could not create the leave balance', {
        employeeId,
        leaveTypeId,
        periodYear,
      });
    }
    return locked;
  }
}
