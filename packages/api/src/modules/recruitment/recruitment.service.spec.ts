import { toId, type HiringRequestId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import type { AuditService } from '../../core/audit/audit.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import type { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { OrganizationService } from '../organization/organization.service';
import type { PositionService } from '../position/position.service';

import type { HiringRequestUpdate } from './entities/hiring-request-update.entity';
import { HiringRequest } from './entities/hiring-request.entity';
import type { JobPosting } from './entities/job-posting.entity';
import { RecruitmentService } from './recruitment.service';

const ORGANIZATION = toId<OrganizationId>('org-1');
const CLIENT_ORGANIZATION = toId<OrganizationId>('org-client');
const USER = toId<UserId>('user-1');
const REQUEST = toId<HiringRequestId>('request-1');

const makeRequest = (overrides: Partial<HiringRequest> = {}): HiringRequest =>
  ({
    id: REQUEST,
    organizationId: ORGANIZATION,
    positionTitle: 'Senior developer',
    jobDescription: 'Build things.',
    headcount: 1,
    employmentType: 'permanent',
    location: null,
    preferredStartDate: null,
    targetFillDate: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    hiringManagerEmployeeId: null,
    reportsToEmployeeId: null,
    priority: 'normal',
    positionId: null,
    clientNote: 'Need a senior engineer.',
    tethrNote: null,
    status: 'submitted',
    requestedByUserId: USER,
    updatedByUserId: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as HiringRequest;

const buildService = (existing: HiringRequest | null = null) => {
  const repository = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((value: HiringRequest) => Promise.resolve(value)),
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
  const platformScope = {
    assertOperator: jest.fn().mockResolvedValue({
      userId: USER,
      organizationId: ORGANIZATION,
      access: { roleKeys: ['tethrHr'], permissions: [], portal: 'tethr' },
    }),
    listClientOrganizationIds: jest.fn().mockResolvedValue([CLIENT_ORGANIZATION]),
    switchTo: jest.fn((_input: unknown, work: () => Promise<unknown>) => work()),
  } as unknown as PlatformScopeService;
  const organizations = {
    getById: jest.fn((id: string) =>
      Promise.resolve({ id, displayName: id === ORGANIZATION ? 'Tethr HQ' : 'Acme Inc' }),
    ),
  } as unknown as OrganizationService;
  const positions = {
    ensureByTitle: jest.fn().mockResolvedValue({ id: 'position-1', status: 'open' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
  } as unknown as PositionService;
  const postings = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<JobPosting>;

  return {
    service: new RecruitmentService(
      repository,
      updates,
      dataSource,
      postings,
      publisher,
      tenantContext,
      audit,
      platformScope,
      organizations,
      positions,
    ),
    manager,
    publisher,
    repository,
    updates,
    platformScope,
    organizations,
    positions,
    postings,
  };
};

describe('RecruitmentService', () => {
  it('submits a client hiring request and emits an outbox event in the transaction', async () => {
    const { service, manager, publisher } = buildService();

    const request = await service.createHiringRequest({
      positionTitle: 'Senior developer',
      requestedByUserId: USER,
      actor: 'client',
      priority: 'urgent',
      salaryMin: 90000,
      salaryCurrency: 'usd',
    });

    expect(request.status).toBe('submitted');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'client',
        hiringRequestId: REQUEST,
        status: 'submitted',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      HiringRequest,
      expect.objectContaining({ priority: 'urgent', salaryMin: '90000.00', salaryCurrency: 'USD' }),
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

  it('opens a submitted request, links a position, and records the trail', async () => {
    const { service, manager, publisher, positions, repository } = buildService(makeRequest());

    const request = await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'open',
      tethrNote: 'Kicking off sourcing.',
      updatedByUserId: USER,
      actor: 'tethr',
    });

    expect(request.status).toBe('open');
    expect(request.tethrNote).toBe('Kicking off sourcing.');
    expect(request.positionId).toBe('position-1');
    expect(positions.ensureByTitle).toHaveBeenCalledWith('Senior developer');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ positionId: 'position-1' }));
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'tethr',
        hiringRequestId: REQUEST,
        note: 'Kicking off sourcing.',
        status: 'open',
      }),
    );
    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'hiringRequest.updated' }),
    );
  });

  it('refuses an illegal transition and leaves the request untouched', async () => {
    const { service, manager, positions } = buildService(makeRequest({ status: 'filled' }));

    await expect(
      service.updateHiringRequest({
        hiringRequestId: REQUEST,
        status: 'open',
        updatedByUserId: USER,
        actor: 'tethr',
      }),
    ).rejects.toThrow('A filled request cannot become open');

    expect(manager.save).not.toHaveBeenCalled();
    expect(positions.ensureByTitle).not.toHaveBeenCalled();
  });

  it('closes the linked position when a request is cancelled', async () => {
    const { service, positions } = buildService(
      makeRequest({ status: 'open', positionId: 'position-1' }),
    );

    await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'cancelled',
      updatedByUserId: USER,
      actor: 'tethr',
    });

    expect(positions.setStatus).toHaveBeenCalledWith('position-1', 'closed');
  });

  it('freezes the linked position when a request is put on hold', async () => {
    const { service, positions } = buildService(
      makeRequest({ status: 'open', positionId: 'position-1' }),
    );
    (positions.ensureByTitle as jest.Mock).mockResolvedValue({ id: 'position-1', status: 'open' });

    await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'onHold',
      updatedByUserId: USER,
      actor: 'tethr',
    });

    expect(positions.setStatus).toHaveBeenCalledWith('position-1', 'frozen');
  });

  it('unpublishes the linked posting when a request is cancelled', async () => {
    const { service, postings } = buildService(
      makeRequest({ status: 'open', positionId: 'position-1' }),
    );
    (postings.find as jest.Mock).mockResolvedValue([
      { id: 'posting-1', sourceHiringRequestId: REQUEST, isPublished: true },
    ]);

    await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'cancelled',
      updatedByUserId: USER,
      actor: 'tethr',
    });

    expect(postings.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'posting-1', isPublished: false }),
    );
  });

  it('emits the request title with the status update so the notifier can name it', async () => {
    const { service, publisher } = buildService(makeRequest({ status: 'open' }));

    await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'cancelled',
      updatedByUserId: USER,
      actor: 'tethr',
    });

    expect(publisher.publishWithin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'hiringRequest.updated',
        payload: expect.objectContaining({ status: 'cancelled', positionTitle: 'Senior developer' }),
      }),
    );
  });

  it('reads the cross-client board under platform scope and labels workspaces', async () => {
    const request = makeRequest({ status: 'open' });
    const { service, repository, platformScope, organizations } = buildService();
    (repository.find as jest.Mock).mockResolvedValue([request]);

    const records = await service.listClientHiringRequests();

    expect(platformScope.assertOperator).toHaveBeenCalled();
    expect(organizations.getById).toHaveBeenCalledWith(ORGANIZATION);
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.organizationName).sort()).toEqual([
      'Acme Inc',
      'Tethr HQ',
    ]);
    expect(platformScope.switchTo).toHaveBeenCalledTimes(2);
  });

  it('switches into the request workspace when the board updates a client request', async () => {
    const { service, platformScope } = buildService(
      makeRequest({ organizationId: CLIENT_ORGANIZATION }),
    );

    const request = await service.updateHiringRequest({
      hiringRequestId: REQUEST,
      status: 'open',
      updatedByUserId: USER,
      actor: 'tethr',
      sourceOrganizationId: CLIENT_ORGANIZATION,
    });

    expect(platformScope.assertOperator).toHaveBeenCalledWith(PERMISSIONS.hiringRequestManage);
    expect(platformScope.switchTo).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: CLIENT_ORGANIZATION }),
      expect.any(Function),
    );
    expect(request.status).toBe('open');
  });

  it('returns client-visible update history with hiring requests', async () => {
    const request = makeRequest({ status: 'open', tethrNote: 'Internal note.' });
    const update = {
      id: 'update-1',
      organizationId: ORGANIZATION,
      hiringRequestId: REQUEST,
      status: 'open',
      actor: 'tethr',
      note: 'Internal note.',
      createdByUserId: USER,
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    } as HiringRequestUpdate;
    const { service, repository, updates } = buildService();
    (repository.find as jest.Mock).mockResolvedValue([request]);
    (updates.find as jest.Mock).mockResolvedValue([update]);

    await expect(service.listHiringRequests()).resolves.toEqual([{ request, updates: [update] }]);
    expect(updates.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC' } }),
    );
  });
});
