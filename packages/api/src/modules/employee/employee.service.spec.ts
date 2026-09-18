import { toId, type EmployeeId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import { ConflictError, ValidationFailedError } from '../../common/errors';
import type { AuditService } from '../../core/audit/audit.service';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { EmployeeService } from './employee.service';
import type { Employee } from './entities/employee.entity';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');

const isoDaysFromToday = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const buildService = (employee: Partial<Employee>) => {
  const manager = {
    findOne: jest.fn((entity: unknown) =>
      (entity as { name?: string }).name === 'EmployeeOffboardingTask'
        ? Promise.resolve(null)
        : Promise.resolve(employee),
    ),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: `saved-${value.taskKey ?? 'row'}`, ...value }),
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
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const service = new EmployeeService(
    {} as TenantScopedRepository<Employee>,
    dataSource,
    publisher,
    tenantContext,
    audit,
  );
  return { service, publisher, manager, audit };
};

const separateInput = (effectiveDate: string) => ({
  employeeId: EMPLOYEE,
  type: 'termination' as const,
  effectiveDate,
  reason: 'resignation',
  reasonForLeaving: 'resignation',
});

describe('EmployeeService.separate', () => {
  it('rejects an employee that is already terminated', async () => {
    const { service, publisher, manager } = buildService({ employmentStatus: 'terminated' });

    await expect(service.separate(separateInput(isoDaysFromToday(0)))).rejects.toThrow(
      ConflictError,
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(publisher.publishWithin).not.toHaveBeenCalled();
  });

  it('rejects a future effective date without changing state', async () => {
    const { service, publisher, manager } = buildService({ employmentStatus: 'active' });

    await expect(service.separate(separateInput(isoDaysFromToday(1)))).rejects.toThrow(
      ValidationFailedError,
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(publisher.publishWithin).not.toHaveBeenCalled();
  });

  it('applies a past-dated termination and seeds the offboarding tasks', async () => {
    const { service, publisher, manager } = buildService({
      id: EMPLOYEE,
      employmentStatus: 'active',
    });

    await service.separate(separateInput(isoDaysFromToday(-1)));

    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'employee.terminated' }),
    );
    // Employee + separation + six offboarding tasks.
    expect(manager.save).toHaveBeenCalledTimes(8);
  });

  it('applies a termination dated today', async () => {
    const { service, publisher } = buildService({ id: EMPLOYEE, employmentStatus: 'active' });

    await service.separate(separateInput(isoDaysFromToday(0)));

    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'employee.terminated' }),
    );
  });

  it('locks the employee row before separating', async () => {
    const { service, manager } = buildService({ id: EMPLOYEE, employmentStatus: 'active' });

    await service.separate(separateInput(isoDaysFromToday(-1)));

    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});

describe('EmployeeService.updateRoleTitle', () => {
  it('writes the audit inside the caller transaction', async () => {
    const { service, manager, audit } = buildService({
      id: EMPLOYEE,
      employmentStatus: 'active',
    });
    const actor = toId<UserId>('user-1');

    await service.updateRoleTitle(EMPLOYEE, 'Engineering lead', actor, manager);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', resourceId: EMPLOYEE }),
      manager,
    );
  });
});