import { toId, type EmployeeId, type OrganizationId, type PositionId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';


import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { EmployeeDirectoryService } from '../employee/employee-directory.service';
import type { PositionService } from '../position/position.service';

import { AssignmentService } from './assignment.service';
import type { Assignment } from './entities/assignment.entity';

const ORG = toId<OrganizationId>('org-1');
const EMPLOYEE = toId<EmployeeId>('emp-1');
const MANAGER = toId<EmployeeId>('emp-2');
const POSITION = toId<PositionId>('pos-1');

const existingPrimary = {
  id: 'assignment-existing',
  employeeId: EMPLOYEE,
  positionId: POSITION,
  assignmentType: 'primary',
  isPrimary: true,
  validFrom: '2026-01-01',
  validTo: '2026-06-01',
  reportsToEmployeeId: null,
} as Assignment;

const openPrimary = {
  id: 'assignment-open',
  employeeId: EMPLOYEE,
  positionId: POSITION,
  assignmentType: 'primary',
  isPrimary: true,
  validFrom: '2026-01-01',
  validTo: null,
  reportsToEmployeeId: null,
} as Assignment;

const buildService = (options: { existing?: Assignment[] } = {}) => {
  const existing = options.existing ?? [existingPrimary];
  const repository = {
    find: jest.fn().mockResolvedValue(existing),
  } as unknown as TenantScopedRepository<Assignment>;
  const manager = {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ ...value, id: 'assignment-new' }),
    ),
    find: jest.fn().mockResolvedValue(existing),
    findOne: jest.fn().mockResolvedValue(null),
    query: jest.fn().mockResolvedValue(undefined),
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
  const employeeDirectory = {
    exists: jest.fn().mockResolvedValue(true),
  } as unknown as EmployeeDirectoryService;
  const positions = {
    getById: jest.fn().mockResolvedValue({ id: POSITION, status: 'open' }),
  } as unknown as PositionService;

  return {
    service: new AssignmentService(
      repository,
      dataSource,
      publisher,
      tenantContext,
      employeeDirectory,
      positions,
    ),
    publisher,
    manager,
    dataSource,
    employeeDirectory,
    positions,
  };
};

describe('AssignmentService.create', () => {
  it('rejects a primary assignment overlapping an existing one', async () => {
    const { service } = buildService();
    await expect(
      service.create({
        employeeId: EMPLOYEE,
        positionId: POSITION,
        validFrom: '2026-03-01', // falls inside the existing [2026-01-01, 2026-06-01)
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('allows a primary assignment that starts after the previous one ends', async () => {
    const { service, publisher } = buildService();
    const assignment = await service.create({
      employeeId: EMPLOYEE,
      positionId: POSITION,
      validFrom: '2026-07-01',
    });
    expect(assignment.id).toBe('assignment-new');
    expect(publisher.publishWithin).toHaveBeenCalled();
  });

  it('rejects an inverted range before touching the database', async () => {
    const { service, dataSource } = buildService();
    await expect(
      service.create({
        employeeId: EMPLOYEE,
        positionId: POSITION,
        validFrom: '2026-08-01',
        validTo: '2026-07-01',
      }),
    ).rejects.toThrow(/on or before/);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an employee that does not exist', async () => {
    const { service, employeeDirectory } = buildService();
    (employeeDirectory.exists as jest.Mock).mockResolvedValue(false);
    await expect(
      service.create({ employeeId: EMPLOYEE, positionId: POSITION, validFrom: '2026-07-01' }),
    ).rejects.toThrow(/Employee not found/);
  });

  it('rejects a position that does not exist', async () => {
    const { service, positions } = buildService();
    (positions.getById as jest.Mock).mockRejectedValueOnce(new Error('Position not found'));
    await expect(
      service.create({ employeeId: EMPLOYEE, positionId: POSITION, validFrom: '2026-07-01' }),
    ).rejects.toThrow(/Position not found/);
  });

  it('validates reporting cycles on direct creates under the graph lock', async () => {
    const { service, manager } = buildService({ existing: [] });
    // The proposed manager reports back to this employee: a cycle.
    (manager.find as jest.Mock).mockResolvedValue([
      { ...openPrimary, employeeId: MANAGER, reportsToEmployeeId: EMPLOYEE },
    ]);

    await expect(
      service.create({
        employeeId: EMPLOYEE,
        positionId: POSITION,
        validFrom: '2026-07-01',
        reportsToEmployeeId: MANAGER,
      }),
    ).rejects.toThrow(/reports to this employee/);

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [expect.stringContaining('reporting-line:')],
    );
  });
});

describe('AssignmentService.end', () => {
  it('rejects ending an already-ended assignment', async () => {
    const { service, manager } = buildService();
    (manager.findOne as jest.Mock).mockResolvedValue(existingPrimary);
    await expect(service.end(existingPrimary.id, '2026-07-01')).rejects.toThrow(/already ended/);
  });

  it('rejects an effective date before the assignment start', async () => {
    const { service, manager } = buildService();
    (manager.findOne as jest.Mock).mockResolvedValue(openPrimary);
    await expect(service.end(openPrimary.id, '2025-12-01')).rejects.toThrow(/cannot precede/);
  });

  it('locks the assignment row before ending it', async () => {
    const { service, manager } = buildService();
    // A copy: end() mutates the entity, and the shared fixture is reused below.
    (manager.findOne as jest.Mock).mockResolvedValue({ ...openPrimary });
    (manager.save as jest.Mock).mockResolvedValue({ ...openPrimary, validTo: '2026-07-01' });

    await service.end(openPrimary.id, '2026-07-01');

    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});

describe('AssignmentService.setReportingLine', () => {
  it('closes and reopens in a single transaction, so a failure cannot leave a hole', async () => {
    const { service, manager, dataSource } = buildService({ existing: [openPrimary] });
    (manager.findOne as jest.Mock).mockResolvedValue(openPrimary);
    (manager.save as jest.Mock)
      .mockResolvedValueOnce({ ...openPrimary, validTo: '2026-07-01' })
      .mockRejectedValueOnce(new Error('write failed'));

    await expect(
      service.setReportingLine({
        employeeId: EMPLOYEE,
        reportsToEmployeeId: MANAGER,
        effectiveDate: '2026-07-01',
      }),
    ).rejects.toThrow('write failed');

    // Both writes ran inside one transaction callback: a real rollback restores
    // the original open assignment.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(2);
    // The graph read is serialized per workspace.
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [expect.stringContaining('reporting-line:')],
    );
  });
});