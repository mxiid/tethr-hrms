import { toId, type HiringRequestId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { AuditService } from '../../core/audit/audit.service';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import type { HiringRequestUpdate } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import { RecruitmentService } from './recruitment.service';

const ORGANIZATION = toId<OrganizationId>('org-1');
const USER = toId<UserId>('user-1');
const REQUEST = toId<HiringRequestId>('request-1');

const buildService = (existing: HiringRequest | null = null) => {
  const repository = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<HiringRequest>;
  const updates = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<HiringRequestUpdate>;
  const manager = {
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: REQUEST, createdAt: new Date(), updatedAt: new Date(), ...value }),
    ),
    findOne: jest.fn().mockResolvedValue(existing),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (transactionManager: EntityManager) => Promise<unknown>) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  const publisher = {
    publishWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as DomainEventPublisher;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION),
  } as unknown as TenantContextService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  return {
    service: new RecruitmentService(
      repository,
      updates,
      dataSource,
      publisher,
      tenantContext,
      audit,
    ),
    manager,
    publisher,
    repository,
    updates,
  };
};

describe('RecruitmentService', () => {
  it('submits a client hiring request and emits an outbox event in the transaction', async () => {
    const { service, manager, publisher } = buildService();

    const request = await service.createHiringRequest({
      positionTitle: 'Senior developer',
      requestedByUserId: USER,
      actor: 'client',
    });

    expect(request.status).toBe('submitted');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'client',
        hiringRequestId: REQUEST,
        status: 'submitted',
      }),
    );
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'hiringRequest.submitted' }),
    );
  });

  it('records a Tethr-raised request with a Tethr first update', async () => {
    const { service, manager } = buildService();

    await service.createHiringRequest({
      positionTitle: 'Staff designer',
      requestedByUserId: USER,
      actor: 'tethr',
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'tethr',
        hiringRequestId: REQUEST,
        status: 'submitted',
      }),
    );
  });

  it('records a Tethr status update and preserves the client brief', async () => {
    const existing = {
      id: REQUEST,
      organizationId: ORGANIZATION,
      positionTitle: 'Senior developer',
      headcount: 1,
      employmentType: 'permanent',
      location: null,
      preferredStartDate: null,
      clientNote: 'Need a senior engineer.',
      status: 'submitted',
      tethrNote: null,
      requestedByUserId: USER,
      updatedByUserId: USER,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as HiringRequest;
    const { service, manager, publisher } = buildService(existing);

    const request = await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'sourcing',
      tethrNote: 'Initial shortlist expected this week.',
      updatedByUserId: USER,
    });

    expect(request.status).toBe('sourcing');
    expect(request.tethrNote).toBe('Initial shortlist expected this week.');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'tethr',
        hiringRequestId: REQUEST,
        note: 'Initial shortlist expected this week.',
        status: 'sourcing',
      }),
    );
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'hiringRequest.updated' }),
    );
  });

  it('returns client-visible update history with hiring requests', async () => {
    const request = {
      id: REQUEST,
      organizationId: ORGANIZATION,
      positionTitle: 'Senior developer',
      headcount: 1,
      employmentType: 'permanent',
      location: null,
      preferredStartDate: null,
      clientNote: 'Need a senior engineer.',
      status: 'sourcing',
      tethrNote: 'Initial shortlist expected this week.',
      requestedByUserId: USER,
      updatedByUserId: USER,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    } as HiringRequest;
    const update = {
      id: 'update-1',
      organizationId: ORGANIZATION,
      hiringRequestId: REQUEST,
      status: 'sourcing',
      actor: 'tethr',
      note: 'Initial shortlist expected this week.',
      createdByUserId: USER,
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    } as HiringRequestUpdate;
    const { service, repository, updates } = buildService();
    const requestFind = repository.find as jest.MockedFunction<typeof repository.find>;
    const updateFind = updates.find as jest.MockedFunction<typeof updates.find>;
    requestFind.mockResolvedValue([request]);
    updateFind.mockResolvedValue([update]);

    await expect(service.listHiringRequests()).resolves.toEqual([{ request, updates: [update] }]);
    expect(updateFind).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC' } }),
    );
  });
});
