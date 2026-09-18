import {
  toId,
  type EmployeeId,
  type LeaveTypeId,
  type OrganizationId,
  type UserId,
} from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { AuditService } from '../../core/audit/audit.service';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { WorkflowService } from '../../core/workflow/workflow.service';
import type { EmployeeDirectoryService } from '../employee/employee-directory.service';

import type { LeaveBalance } from './entities/leave-balance.entity';
import type { LeaveRequest } from './entities/leave-request.entity';
import type { LeaveType } from './entities/leave-type.entity';
import type { HolidayService } from './holiday.service';
import { LeaveRequestService } from './leave-request.service';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const LEAVE_TYPE = toId<LeaveTypeId>('lt-1');
const APPROVER = toId<UserId>('user-1');

const balanceKey = (where: Record<string, unknown>): string =>
  `${String(where.employeeId)}:${String(where.leaveTypeId)}:${String(where.periodYear)}`;

const buildService = (options: { leaveType?: Partial<LeaveType>; managerFindOne?: jest.Mock }) => {
  const leaveType = {
    id: 'lt-1',
    requiresApproval: false,
    defaultAnnualEntitlement: '20.00',
    ...(options.leaveType ?? {}),
  } as LeaveType;

  const requests = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<LeaveRequest>;
  const leaveTypes = {
    findById: jest.fn().mockResolvedValue(leaveType),
  } as unknown as TenantScopedRepository<LeaveType>;

  // A tiny balance store so create-then-locked-read behaves like the database.
  const balances = new Map<string, Record<string, unknown>>();
  const baseFindOne = options.managerFindOne ?? jest.fn().mockResolvedValue(null);
  const manager = {
    findOne: jest.fn((entity: unknown, findOptions?: { where?: Record<string, unknown> }) => {
      if ((entity as { name?: string }).name === 'LeaveBalance') {
        const stored = balances.get(balanceKey(findOptions?.where ?? {}));
        if (stored) {
          return Promise.resolve(stored);
        }
      }
      return baseFindOne(entity, findOptions);
    }),
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
    save: jest.fn((value: Record<string, unknown>) => {
      const persisted = { id: `generated-${balances.size + 1}`, ...value };
      if (value.periodYear !== undefined && value.leaveTypeId !== undefined) {
        balances.set(balanceKey(value), persisted);
      }
      return Promise.resolve(persisted);
    }),
    transaction: jest.fn((callback: (inner: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
    ),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const publisher = {
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;
  const holidayService = {
    getHolidayDates: jest.fn().mockResolvedValue(new Set<string>()),
  } as unknown as HolidayService;
  const workflowService = {
    requestApproval: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    decide: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'approved' }),
  } as unknown as WorkflowService;
  const entitlementService = {
    resolveEntitlement: jest
      .fn()
      .mockImplementation((_e: unknown, _l: unknown, fallback: number) =>
        Promise.resolve(fallback),
      ),
  } as unknown as import('./employee-leave-entitlement.service').EmployeeLeaveEntitlementService;
  const employeeDirectory = {
    exists: jest.fn().mockResolvedValue(true),
  } as unknown as EmployeeDirectoryService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const service = new LeaveRequestService(
    requests,
    leaveTypes,
    dataSource,
    publisher,
    tenantContext,
    holidayService,
    workflowService,
    entitlementService,
    employeeDirectory,
    audit,
  );
  return { service, publisher, manager, workflowService, employeeDirectory, balances };
};

describe('LeaveRequestService.submit', () => {
  it('costs the request in working days, reserves balance, and emits leave.requested', async () => {
    const { service, publisher } = buildService({});
    // Mon 2026-06-15 .. Fri 2026-06-19 = 5 working days.
    const request = await service.submit({
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-06-15',
      endDate: '2026-06-19',
    });
    expect(request.dayCount).toBe('5.00');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'leave.requested' }),
    );
  });

  it('rejects when the balance is insufficient', async () => {
    const { service } = buildService({ leaveType: { defaultAnnualEntitlement: '2.00' } });
    await expect(
      service.submit({
        employeeId: EMPLOYEE,
        leaveTypeId: LEAVE_TYPE,
        startDate: '2026-06-15',
        endDate: '2026-06-19',
      }),
    ).rejects.toThrow(/Insufficient/);
  });

  it('rejects an inverted date range', async () => {
    const { service } = buildService({});
    await expect(
      service.submit({
        employeeId: EMPLOYEE,
        leaveTypeId: LEAVE_TYPE,
        startDate: '2026-06-19',
        endDate: '2026-06-15',
      }),
    ).rejects.toThrow(/on or before/);
  });

  it('rejects an employee that does not exist', async () => {
    const { service, employeeDirectory } = buildService({});
    (employeeDirectory.exists as jest.Mock).mockResolvedValue(false);
    await expect(
      service.submit({
        employeeId: EMPLOYEE,
        leaveTypeId: LEAVE_TYPE,
        startDate: '2026-06-15',
        endDate: '2026-06-19',
      }),
    ).rejects.toThrow(/Employee not found/);
  });

  it('splits a cross-year request across both years (D2)', async () => {
    const { service, manager } = buildService({});
    // Mon 2026-12-28 .. Fri 2027-01-01: 4 working days in 2026, 1 in 2027.
    const request = await service.submit({
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-12-28',
      endDate: '2027-01-01',
    });

    expect(request.dayCount).toBe('5.00');
    expect(request.yearAllocations).toEqual([
      { year: 2026, days: 4 },
      { year: 2027, days: 1 },
    ]);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ periodYear: 2026, pendingDays: '4.00' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ periodYear: 2027, pendingDays: '1.00' }),
    );
  });

  it('locks the balance row before reserving (no oversubscription)', async () => {
    const { service, manager } = buildService({});
    await service.submit({
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-06-15',
      endDate: '2026-06-19',
    });

    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('creates the approval row inside the submission transaction', async () => {
    const { service, workflowService } = buildService({ leaveType: { requiresApproval: true } });
    const request = await service.submit({
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      requestedByUserId: APPROVER,
    });

    expect(request.approvalRequestId).toBe('approval-1');
    expect(workflowService.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ subjectType: 'leave_request', subjectId: request.id }),
      expect.anything(),
    );
  });
});

describe('LeaveRequestService.approve', () => {
  it('releases the pending reservation, books used days, emits leave.approved, and decides the workflow row', async () => {
    const pendingRequest = {
      id: 'lr-1',
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      dayCount: '5.00',
      yearAllocations: [{ year: 2026, days: 5 }],
      status: 'pending',
      approvalRequestId: 'approval-1',
    } as unknown as LeaveRequest;
    const balance = {
      id: 'bal-1',
      periodYear: 2026,
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      pendingDays: '5.00',
      usedDays: '0',
      entitledDays: '20.00',
    } as LeaveBalance;
    const managerFindOne = jest
      .fn()
      .mockResolvedValueOnce(pendingRequest)
      .mockResolvedValueOnce(balance);

    const { service, publisher, workflowService } = buildService({ managerFindOne });
    await service.approve('lr-1', APPROVER, 'enjoy');

    expect(balance.pendingDays).toBe('0.00');
    expect(balance.usedDays).toBe('5.00');
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'leave.approved' }),
    );
    expect(workflowService.decide).toHaveBeenCalledWith(
      'approval-1',
      APPROVER,
      'approved',
      'enjoy',
      expect.anything(),
    );
  });

  it('releases the pending reservation on rejection without booking used days', async () => {
    const pendingRequest = {
      id: 'lr-2',
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      dayCount: '5.00',
      yearAllocations: [{ year: 2026, days: 5 }],
      status: 'pending',
      approvalRequestId: 'approval-2',
    } as unknown as LeaveRequest;
    const balance = {
      id: 'bal-1',
      periodYear: 2026,
      employeeId: EMPLOYEE,
      leaveTypeId: LEAVE_TYPE,
      pendingDays: '5.00',
      usedDays: '0',
      entitledDays: '20.00',
    } as LeaveBalance;
    const managerFindOne = jest
      .fn()
      .mockResolvedValueOnce(pendingRequest)
      .mockResolvedValueOnce(balance);

    const { service, workflowService } = buildService({ managerFindOne });
    await service.reject('lr-2', APPROVER);

    expect(balance.pendingDays).toBe('0.00');
    expect(balance.usedDays).toBe('0');
    expect(workflowService.decide).toHaveBeenCalledWith(
      'approval-2',
      APPROVER,
      'rejected',
      undefined,
      expect.anything(),
    );
  });
});