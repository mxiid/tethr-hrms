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
    private readonly audit: AuditService,
  ) {}

  async submit(input: SubmitLeaveRequestData): Promise<LeaveRequest> {
    if (compareIsoDate(input.startDate, input.endDate) > 0) {
      throw new ValidationFailedError('startDate must be on or before endDate');
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
    const dayCount = countWorkingDays(input.startDate, input.endDate, holidays);
    if (dayCount <= 0) {
      throw new ValidationFailedError('Requested range contains no working days');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const periodYear = Number(input.startDate.slice(0, 4));
    const resolvedEntitlement = await this.entitlementService.resolveEntitlement(
      input.employeeId,
      input.leaveTypeId,
      Number(leaveType.defaultAnnualEntitlement),
      input.startDate,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      const balance = await this.getOrCreateBalance(
        manager,
        organizationId,
        input.employeeId,
        input.leaveTypeId,
        periodYear,
        resolvedEntitlement.toFixed(2),
      );
      const available =
        toNumber(balance.entitledDays) - toNumber(balance.usedDays) - toNumber(balance.pendingDays);
      if (dayCount > available) {
        throw new ValidationFailedError('Insufficient leave balance', {
          available,
          requested: dayCount,
        });
      }
      balance.pendingDays = toAmount(toNumber(balance.pendingDays) + dayCount);
      await manager.save(balance);

      const request = manager.create(LeaveRequest, {
        organizationId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        dayCount: toAmount(dayCount),
        reason: input.reason ?? null,
        status: 'pending',
        approvalRequestId: null,
        decidedByUserId: null,
        decisionNote: null,
      });
      const persisted = await manager.save(request);

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

    // Route to the shared workflow engine. Separate transaction by design — if it
    // fails the request still stands as 'pending' and can be decided directly.
    if (leaveType.requiresApproval && input.requestedByUserId) {
      const approval = await this.workflowService.requestApproval({
        subjectType: 'leave_request',
        subjectId: saved.id,
        requestedByUserId: input.requestedByUserId,
      });
      saved.approvalRequestId = approval.id;
      await this.requests.save(saved);
    }

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
      const request = await manager.findOne(LeaveRequest, { where: { id, organizationId } });
      if (!request) {
        throw new NotFoundError('Leave request not found', { id });
      }
      if (request.status !== 'pending') {
        throw new ConflictError('Leave request is not pending', { status: request.status });
      }

      const days = toNumber(request.dayCount);
      const periodYear = Number(request.startDate.slice(0, 4));
      const balance = await manager.findOne(LeaveBalance, {
        where: {
          organizationId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          periodYear,
        },
      });
      if (balance) {
        // Always release the pending reservation; on approval, spend it.
        balance.pendingDays = toAmount(Math.max(0, toNumber(balance.pendingDays) - days));
        if (status === 'approved') {
          balance.usedDays = toAmount(toNumber(balance.usedDays) + days);
        }
        await manager.save(balance);
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
    });
    if (existing) {
      return existing;
    }
    const created = manager.create(LeaveBalance, {
      organizationId,
      employeeId,
      leaveTypeId,
      periodYear,
      entitledDays,
      usedDays: '0',
      pendingDays: '0',
    });
    return manager.save(created);
  }
}
