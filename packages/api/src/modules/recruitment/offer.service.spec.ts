import { toId, type OrganizationId, type UserId } from '@hrms/shared';

import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import type { EmployeeService } from '../employee/employee.service';
import type { PositionService } from '../position/position.service';

import type { Application } from './entities/application.entity';
import type { Candidate } from './entities/candidate.entity';
import type { JobPosting } from './entities/job-posting.entity';
import type { Offer } from './entities/offer.entity';
import { OfferService } from './offer.service';
import type { RecruitmentService } from './recruitment.service';

const TETHR = toId<OrganizationId>('org-tethr');
const CLIENT = toId<OrganizationId>('org-client');
const USER = toId<UserId>('user-1');
const OFFER_ID = 'offer-1';

const buildService = (options: { offers?: Partial<Offer>[]; offer?: Partial<Offer> } = {}) => {
  const offer = {
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
  const offers = {
    find: jest.fn().mockResolvedValue(options.offers ?? []),
    findById: jest.fn().mockResolvedValue(offer),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: OFFER_ID, ...value })),
  } as unknown as TenantScopedRepository<Offer>;
  const applications = {
    findById: jest.fn().mockResolvedValue({
      id: 'application-1',
      candidateId: 'candidate-1',
      jobPostingId: 'posting-1',
      stage: 'offer',
      outcome: 'active',
    }),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<Application>;
  const candidates = {
    findById: jest.fn().mockResolvedValue({
      id: 'candidate-1',
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
    }),
  } as unknown as TenantScopedRepository<Candidate>;
  const postings = {
    findById: jest.fn().mockResolvedValue({
      id: 'posting-1',
      title: 'Staff Engineer',
      sourceOrganizationId: CLIENT,
      sourceHiringRequestId: 'request-1',
      isPublished: true,
    }),
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
    ),
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

  it('acceptance hires into the client workspace and closes the loop', async () => {
    const { service, employees, applications, postings, positions, recruitment, platformScope } =
      buildService();

    const accepted = await service.accept(OFFER_ID, USER);

    expect(platformScope.assertOperator).toHaveBeenCalled();
    expect(employees.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Grace',
        lastName: 'Hopper',
        workEmail: 'grace@example.com',
        roleTitle: 'Staff Engineer',
        hireDate: '2026-10-01',
        workerType: 'permanent',
      }),
    );
    expect(accepted.employeeId).toBe('employee-1');
    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'hired', outcome: 'hired' }),
    );
    expect(postings.save).toHaveBeenCalledWith(expect.objectContaining({ isPublished: false }));
    expect(recruitment.updateHiringRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'filled',
        sourceOrganizationId: CLIENT,
        actor: 'tethr',
      }),
    );
    expect(positions.setStatus).toHaveBeenCalledWith('position-1', 'filled');
  });

  it('refuses acceptance of an offer that was never sent', async () => {
    const { service } = buildService({ offer: { status: 'draft' } });

    await expect(service.accept(OFFER_ID, USER)).rejects.toThrow('Only a sent offer can be accepted');
  });
});
