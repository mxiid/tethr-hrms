import { toId, type OrganizationId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import type { Position } from './entities/position.entity';
import { PositionService } from './position.service';

const ORG = toId<OrganizationId>('org-1');

const buildService = () => {
  const positionsRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'position-1', ...value }),
    ),
  };
  const jobsRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'General' }),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      (entity as { name?: string }).name === 'Job' ? jobsRepository : positionsRepository,
    ),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;

  const service = new PositionService(
    {} as TenantScopedRepository<Position>,
    dataSource,
    tenantContext,
  );
  return { service, manager };
};

describe('PositionService.ensureByTitle', () => {
  it('serializes concurrent creation for the same title with an advisory lock', async () => {
    const { service, manager } = buildService();

    const position = await service.ensureByTitle('Senior developer');

    expect(position.id).toBe('position-1');
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [expect.stringContaining('position:')],
    );
  });
});