import { toId, type OrganizationId } from '@hrms/shared';

import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import type { Application } from './entities/application.entity';
import type { Candidate } from './entities/candidate.entity';
import type { JobPosting } from './entities/job-posting.entity';
import type { ShortlistEntry } from './entities/shortlist-entry.entity';
import type { Shortlist } from './entities/shortlist.entity';
import { ShortlistService } from './shortlist.service';

const TETHR = toId<OrganizationId>('org-tethr');
const CLIENT = toId<OrganizationId>('org-client');

const buildService = (options: { callerOrganization?: OrganizationId } = {}) => {
  const shortlists = {
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'shortlist-1', createdAt: new Date(), ...value }),
    ),
  } as unknown as TenantScopedRepository<Shortlist>;
  const entries = {
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'entry-1', ...value }),
    ),
  } as unknown as TenantScopedRepository<ShortlistEntry>;
  const applications = {
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<Application>;
  const candidates = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<Candidate>;
  const postings = {
    findById: jest.fn().mockResolvedValue({
      id: 'posting-1',
      sourceOrganizationId: CLIENT,
      title: 'Senior developer',
    }),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<JobPosting>;
  const platformScope = {
    resolveTethrOrganizationId: jest.fn().mockResolvedValue(TETHR),
    switchTo: jest.fn((_input: unknown, work: () => Promise<unknown>) => work()),
  } as unknown as PlatformScopeService;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(options.callerOrganization ?? TETHR),
  } as unknown as TenantContextService;

  return {
    service: new ShortlistService(
      shortlists,
      entries,
      applications,
      candidates,
      postings,
      platformScope,
      tenantContext,
    ),
    shortlists,
    entries,
    applications,
    candidates,
    postings,
    platformScope,
    tenantContext,
  };
};

describe('ShortlistService', () => {
  it('creates a round ranked in the order given', async () => {
    const { service, shortlists, entries, applications } = buildService();
    (applications.find as jest.Mock).mockResolvedValue([
      { id: 'app-1', jobPostingId: 'posting-1' },
      { id: 'app-2', jobPostingId: 'posting-1' },
    ]);

    const record = await service.createShortlist({
      jobPostingId: 'posting-1',
      applicationIds: ['app-2', 'app-1'],
    });

    expect(shortlists.create).toHaveBeenCalledWith(
      expect.objectContaining({ roundNumber: 1, status: 'draft' }),
    );
    expect(entries.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ applicationId: 'app-2', rank: 1, clientDecision: 'pending' }),
    );
    expect(entries.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ applicationId: 'app-1', rank: 2 }),
    );
    expect(record.entries).toHaveLength(2);
  });

  it('continues the round numbering from the posting’s existing rounds', async () => {
    const { service, shortlists, applications } = buildService();
    (shortlists.find as jest.Mock).mockResolvedValue([{ roundNumber: 1 }, { roundNumber: 2 }]);
    (applications.find as jest.Mock).mockResolvedValue([
      { id: 'app-1', jobPostingId: 'posting-1' },
    ]);

    await service.createShortlist({ jobPostingId: 'posting-1', applicationIds: ['app-1'] });

    expect(shortlists.create).toHaveBeenCalledWith(expect.objectContaining({ roundNumber: 3 }));
  });

  it('presenting moves the round’s applications to the shortlisted stage', async () => {
    const { service, shortlists, entries, applications } = buildService();
    (shortlists.findById as jest.Mock).mockResolvedValue({
      id: 'shortlist-1',
      status: 'draft',
      presentedAt: null,
    });
    (entries.find as jest.Mock).mockResolvedValue([{ applicationId: 'app-1', rank: 1 }]);
    (applications.find as jest.Mock).mockResolvedValue([
      { id: 'app-1', stage: 'screening' },
    ]);

    await service.present('shortlist-1');

    expect(applications.save).toHaveBeenCalledWith(expect.objectContaining({ stage: 'shortlisted' }));
  });

  it('refuses to present a round that is not a draft', async () => {
    const { service, shortlists } = buildService();
    (shortlists.findById as jest.Mock).mockResolvedValue({ id: 'shortlist-1', status: 'closed' });

    await expect(service.present('shortlist-1')).rejects.toThrow(
      'Only a draft shortlist can be presented',
    );
  });

  it('lets the owning client record a verdict through the projection', async () => {
    const { service, entries, shortlists, postings } = buildService({ callerOrganization: CLIENT });
    (entries.findById as jest.Mock).mockResolvedValue({
      id: 'entry-1',
      shortlistId: 'shortlist-1',
      clientDecision: 'pending',
      clientNote: null,
      decidedAt: null,
    });
    (shortlists.findById as jest.Mock).mockResolvedValue({ id: 'shortlist-1', status: 'presented' });
    (postings.findById as jest.Mock).mockResolvedValue({
      id: 'posting-1',
      sourceOrganizationId: CLIENT,
    });

    const entry = await service.recordDecision({
      shortlistEntryId: 'entry-1',
      decision: 'interested',
      note: 'Move to interview.',
    });

    expect(entry.clientDecision).toBe('interested');
    expect(entry.clientNote).toBe('Move to interview.');
    expect(shortlists.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'feedbackReceived' }),
    );
  });

  it('a client rejection ends the application instead of waiting for a second update', async () => {
    const { service, entries, shortlists, postings, applications } = buildService({
      callerOrganization: CLIENT,
    });
    (entries.findById as jest.Mock).mockResolvedValue({
      id: 'entry-1',
      shortlistId: 'shortlist-1',
      applicationId: 'application-1',
      clientDecision: 'pending',
      clientNote: null,
      decidedAt: null,
    });
    (shortlists.findById as jest.Mock).mockResolvedValue({ id: 'shortlist-1', status: 'presented' });
    (postings.findById as jest.Mock).mockResolvedValue({
      id: 'posting-1',
      sourceOrganizationId: CLIENT,
    });
    (applications.findById as jest.Mock).mockResolvedValue({
      id: 'application-1',
      stage: 'shortlisted',
      outcome: 'active',
    });

    await service.recordDecision({ shortlistEntryId: 'entry-1', decision: 'rejected' });

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'application-1', outcome: 'rejected' }),
    );
  });

  it('hides another client’s entry as not-found', async () => {
    const { service, entries, shortlists, postings } = buildService({ callerOrganization: CLIENT });
    (entries.findById as jest.Mock).mockResolvedValue({ id: 'entry-1', shortlistId: 'shortlist-1' });
    (shortlists.findById as jest.Mock).mockResolvedValue({ id: 'shortlist-1', status: 'presented' });
    (postings.findById as jest.Mock).mockResolvedValue({
      id: 'posting-1',
      sourceOrganizationId: toId<OrganizationId>('org-other-client'),
    });

    await expect(
      service.recordDecision({ shortlistEntryId: 'entry-1', decision: 'interested' }),
    ).rejects.toThrow('Shortlist entry not found');
  });

  it('returns no projection when the caller is Tethr itself', async () => {
    const { service } = buildService({ callerOrganization: TETHR });

    await expect(service.listPresentedForClientOrganization()).resolves.toEqual([]);
  });
});
