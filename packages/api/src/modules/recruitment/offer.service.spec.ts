import { toId, type OrganizationId, type UserId } from '@hrms/shared';

import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { EmployeeService } from '../employee/employee.service';
import type { PositionService } from '../position/position.service';

import { Application } from './entities/application.entity';
import { Candidate } from './entities/candidate.entity';
import { JobPosting } from './entities/job-posting.entity';
import { Offer } from './entities/offer.entity';
import { OfferService } from './offer.service';
import type { RecruitmentService } from './recruitment.service';

const TETHR = toId<OrganizationId>('org-tethr');
const CLIENT = toId<OrganizationId>('org-client');
const USER = toId<UserId>('user-1');
const OFFER_ID = 'offer-1';

const buildService = (options: { offers?: Partial<Offer>[]; offer?: Partial<Offer> } = {}) => {  const offer = {
    id: OFFER_ID,
    organizationId: TETHR,
    applicationId: 'application-1',
    baseSalary: '100000.00',
    salaryCurrency: 'USD',
    startDate: '2026-10-01',
    probationDays: 90,
    noticePeriodDays: 30,
    extras: [],
    status: 'sent',
    sentAt: new Date(),
    respondedAt: null,
    hiredEmployeeId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options.offer,
  } as Offer;
  const application = {
    id: 'application-1',
    candidateId: 'candidate-1',
    jobPostingId: 'posting-1',
    stage: 'offer',
    outcome: 'active',
  } as Application;
  const candidate = {
    id: 'candidate-1',
    fullName: 'Grace Hopper',
    email: 'grace@example.com',
  } as Candidate;
  const posting = {
    id: 'posting-1',
    title: 'Staff Engineer',
    sourceOrganizationId: CLIENT,
    sourceHiringRequestId: 'request-1',
    isPublished: true,
  } as unknown as JobPosting;

  type FakeManager = {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    transaction: jest.Mock;
  };
  const manager: FakeManager = {
    findOne: jest.fn((entity: unknown) => {
      if (entity === Offer) return Promise.resolve(offer);
      if (entity === Application) return Promise.resolve(application);
      if (entity === Candidate) return Promise.resolve(candidate);
      if (entity === JobPosting) return Promise.resolve(posting);
      return Promise.resolve(null);
    }),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    transaction: jest.fn(),
  };
  // Nested transactions are savepoints in TypeORM; run the callback inline.
  manager.transaction.mockImplementation((work: (inner: FakeManager) => Promise<unknown>) =>
    work(manager),
  );
  const dataSource = {
    transaction: jest.fn((work: (inner: FakeManager) => Promise<unknown>) => work(manager)),
  };

  const offers = {
    find: jest.fn().mockResolvedValue(options.offers ?? []),
    findById: jest.fn().mockResolvedValue(offer),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: OFFER_ID, ...value })),
  } as unknown as TenantScopedRepository<Offer>;
  const applications = {
    findById: jest.fn().mockResolvedValue(application),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<Application>;
  const candidates = {
    findById: jest.fn().mockResolvedValue(candidate),
  } as unknown as TenantScopedRepository<Candidate>;
  const postings = {
    findById: jest.fn().mockResolvedValue(posting),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<JobPosting>;
  const employees = {
    create: jest.fn().mockResolvedValue({ id: 'employee-1' }),
  } as unknown as EmployeeService;
  const positions = {
    ensureByTitle: jest.fn().mockResolvedValue({ id: 'position-1', status: 'open' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
  } as unknown as PositionService;
  const recruitment = {
    updateHiringRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as RecruitmentService;
  const platformScope = {
    assertOperator: jest.fn().mockResolvedValue({ organizationId: TETHR }),
    switchTo: jest.fn((_input: unknown, work: () => Promise<unknown>) => work()),
  } as unknown as PlatformScopeService;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(TETHR),
  } as unknown as TenantContextService;

  return {
    service: new OfferService(
      offers,
      applications,
      candidates,
      postings,
      employees,
      positions,
      recruitment,
      platformScope,
      dataSource as never,
      tenantContext,
    ),
    manager,
    dataSource,
    offers,
    applications,
    postings,
    employees,
    positions,
    recruitment,
    platformScope,
  };
};

describe('OfferService', () => {
  it('refuses a second active offer for the same application', async () => {
    const { service } = buildService({ offers: [{ status: 'sent' } as Offer] });

    await expect(
      service.createOffer({
        applicationId: 'application-1',
        baseSalary: 90000,
        salaryCurrency: 'usd',
        startDate: '2026-10-01',
      }),
    ).rejects.toThrow('already has an active offer');
  });

  it('only sends a draft', async () => {
    const { service } = buildService({ offer: { status: 'accepted' } });

    await expect(service.send(OFFER_ID)).rejects.toThrow('Only a draft offer can be sent');
  });

  it('moves the application to the offer stage when the offer is sent', async () => {
    const { service, applications } = buildService({ offer: { status: 'draft' } });
    (applications.findById as jest.Mock).mockResolvedValueOnce({
      id: 'application-1',
      stage: 'interviewing',
      outcome: 'active',
    });

    await service.send(OFFER_ID);

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'application-1', stage: 'offer' }),
    );
  });

  it('declining ends the application as withdrawn', async () => {
    const { service, applications } = buildService();

    await service.decline(OFFER_ID, 'Accepted another role');

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'application-1', outcome: 'withdrawn' }),
    );
  });

  it('withdrawing ends the application as rejected', async () => {
    const { service, applications } = buildService();

    await service.withdraw(OFFER_ID);

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'application-1', outcome: 'rejected' }),
    );
  });

  it('never rewrites an application that already hired', async () => {
    const { service, applications } = buildService();
    (applications.findById as jest.Mock).mockResolvedValueOnce({
      id: 'application-1',
      stage: 'hired',
      outcome: 'hired',
    });

    await service.withdraw(OFFER_ID);

    expect(applications.save).not.toHaveBeenCalled();
  });

  it('acceptance locks the offer, hires into the client workspace, and closes the loop in one transaction', async () => {
    const {
      service,
      manager,
      employees,
      positions,
      recruitment,
      platformScope,
    } = buildService();

    const accepted = await service.accept(OFFER_ID, USER);

    expect(platformScope.assertOperator).toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(
      Offer,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(employees.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Grace',
        lastName: 'Hopper',
        workEmail: 'grace@example.com',
        roleTitle: 'Staff Engineer',
        hireDate: '2026-10-01',
        workerType: 'permanent',
      }),
      expect.anything(),
    );
    expect(accepted.employeeId).toBe('employee-1');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: OFFER_ID, status: 'accepted', hiredEmployeeId: 'employee-1' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'hired', outcome: 'hired' }),
    );
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ isPublished: false }));
    expect(recruitment.updateHiringRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'filled', actor: 'tethr', manager: expect.anything() }),
    );
    expect(positions.ensureByTitle).toHaveBeenCalledWith('Staff Engineer', expect.anything());
    expect(positions.setStatus).toHaveBeenCalledWith('position-1', 'filled', expect.anything());
  });

  it('refuses acceptance of an offer that was never sent', async () => {
    const { service } = buildService({ offer: { status: 'draft' } });

    await expect(service.accept(OFFER_ID, USER)).rejects.toThrow('Only a sent offer can be accepted');
  });
});
