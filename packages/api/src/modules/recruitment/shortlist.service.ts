import { type ShortlistDecision, type ShortlistStatus } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { APPLICATION_REPOSITORY, CANDIDATE_REPOSITORY, JOB_POSTING_REPOSITORY, SHORTLIST_ENTRY_REPOSITORY, SHORTLIST_REPOSITORY } from './ats.tokens';
import { Application } from './entities/application.entity';
import { Candidate } from './entities/candidate.entity';
import { JobPosting } from './entities/job-posting.entity';
import { ShortlistEntry } from './entities/shortlist-entry.entity';
import { Shortlist } from './entities/shortlist.entity';

export type ShortlistRecord = {
  readonly shortlist: Shortlist;
  readonly entries: readonly ShortlistEntry[];
};

export type ClientShortlistEntryRecord = {
  readonly entry: ShortlistEntry;
  readonly application: Application | null;
  readonly candidate: Candidate | null;
};

export type ClientShortlistRecord = {
  readonly shortlist: Shortlist;
  readonly posting: JobPosting;
  readonly entries: readonly ClientShortlistEntryRecord[];
};

export type CreateShortlistData = {
  readonly jobPostingId: string;
  readonly applicationIds: readonly string[];
  readonly roundNumber?: number | null;
};

export type RecordShortlistDecisionData = {
  readonly shortlistEntryId: string;
  readonly decision: ShortlistDecision;
  readonly note?: string | null;
};

// Shortlists in batches — the agency's core flow. Batches live in Tethr's
// workspace; the client reads only the round presented to them, through the
// narrow projection below (filtered by the posting's source organization, never
// by an id the client supplied).
@Injectable()
export class ShortlistService {
  constructor(
    @Inject(SHORTLIST_REPOSITORY) private readonly shortlists: TenantScopedRepository<Shortlist>,
    @Inject(SHORTLIST_ENTRY_REPOSITORY)
    private readonly entries: TenantScopedRepository<ShortlistEntry>,
    @Inject(APPLICATION_REPOSITORY)
    private readonly applications: TenantScopedRepository<Application>,
    @Inject(CANDIDATE_REPOSITORY) private readonly candidates: TenantScopedRepository<Candidate>,
    @Inject(JOB_POSTING_REPOSITORY) private readonly postings: TenantScopedRepository<JobPosting>,
    private readonly platformScope: PlatformScopeService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createShortlist(input: CreateShortlistData): Promise<ShortlistRecord> {
    const posting = await this.postings.findById(input.jobPostingId);
    if (!posting) {
      throw new NotFoundError('Job posting not found', { id: input.jobPostingId });
    }
    if (input.applicationIds.length === 0) {
      throw new ValidationFailedError('A shortlist needs at least one application');
    }
    const applications = await this.applications.find({
      where: { id: In([...input.applicationIds]) },
    });
    if (applications.length !== input.applicationIds.length) {
      throw new NotFoundError('One or more applications were not found');
    }
    for (const application of applications) {
      if (application.jobPostingId !== input.jobPostingId) {
        throw new ValidationFailedError('An application does not belong to this posting', {
          applicationId: application.id,
        });
      }
    }

    const roundNumber = input.roundNumber ?? (await this.nextRoundNumber(input.jobPostingId));
    const organizationId = this.tenantContext.getOrganizationId();
    const shortlist = await this.shortlists.save(
      this.shortlists.create({
        organizationId,
        jobPostingId: input.jobPostingId,
        roundNumber,
        status: 'draft',
        presentedAt: null,
        closedAt: null,
      }),
    );
    const entries: ShortlistEntry[] = [];
    for (const [index, applicationId] of input.applicationIds.entries()) {
      entries.push(
        await this.entries.save(
          this.entries.create({
            organizationId,
            shortlistId: shortlist.id,
            applicationId,
            rank: index + 1,
            clientDecision: 'pending',
            clientNote: null,
            decidedAt: null,
          }),
        ),
      );
    }
    return { shortlist, entries };
  }

  async listForPosting(jobPostingId: string): Promise<ShortlistRecord[]> {
    const shortlists = await this.shortlists.find({
      where: { jobPostingId },
      order: { roundNumber: 'DESC' },
    });
    return this.withEntries(shortlists);
  }

  // Presenting a round flags the applications as shortlisted so the pipeline
  // reflects where they are; the client's verdict stays on the entry.
  async present(shortlistId: string): Promise<ShortlistRecord> {
    const shortlist = await this.getById(shortlistId);
    if (shortlist.status !== 'draft') {
      throw new ConflictError('Only a draft shortlist can be presented');
    }
    shortlist.status = 'presented';
    shortlist.presentedAt = new Date();
    const saved = await this.shortlists.save(shortlist);
    const entries = await this.entries.find({ where: { shortlistId }, order: { rank: 'ASC' } });
    if (entries.length > 0) {
      const applications = await this.applications.find({
        where: { id: In(entries.map((entry) => entry.applicationId)) },
      });
      for (const application of applications) {
        application.stage = 'shortlisted';
        await this.applications.save(application);
      }
    }
    return { shortlist: saved, entries };
  }

  async close(shortlistId: string): Promise<ShortlistRecord> {
    const shortlist = await this.getById(shortlistId);
    if (shortlist.status !== 'presented' && shortlist.status !== 'feedbackReceived') {
      throw new ConflictError('Only a presented shortlist can be closed');
    }
    shortlist.status = 'closed';
    shortlist.closedAt = new Date();
    return {
      shortlist: await this.shortlists.save(shortlist),
      entries: await this.entries.find({ where: { shortlistId }, order: { rank: 'ASC' } }),
    };
  }

  async getForPosting(shortlistId: string): Promise<ShortlistRecord> {
    const shortlist = await this.getById(shortlistId);
    return {
      shortlist,
      entries: await this.entries.find({ where: { shortlistId }, order: { rank: 'ASC' } }),
    };
  }

  // The client's read: presented (and post-presentation) rounds whose posting
  // traces back to the caller's own organization. Runs under the Tethr tenant
  // via the audited platform switch, with the filter applied from the caller's
  // organization — never from anything the caller sent.
  async listPresentedForClientOrganization(): Promise<ClientShortlistRecord[]> {
    const clientOrganizationId = this.tenantContext.getOrganizationId();
    const tethrOrganizationId = await this.platformScope.resolveTethrOrganizationId();
    if (clientOrganizationId === tethrOrganizationId) {
      return [];
    }
    return this.platformScope.switchTo(
      {
        organizationId: tethrOrganizationId,
        purpose: 'presented shortlists read',
        resourceType: 'shortlist',
        resourceId: clientOrganizationId,
      },
      async () => {
        const postings = await this.postings.find({
          where: { sourceOrganizationId: clientOrganizationId },
        });
        if (postings.length === 0) return [];
        const postingsById = new Map(postings.map((posting) => [posting.id, posting]));
        const shortlists = await this.shortlists.find({
          where: {
            jobPostingId: In(postings.map((posting) => posting.id)),
            status: In(['presented', 'feedbackReceived', 'closed'] as ShortlistStatus[]),
          },
          order: { presentedAt: 'DESC' },
        });
        const records: ClientShortlistRecord[] = [];
        for (const shortlist of shortlists) {
          const posting = postingsById.get(shortlist.jobPostingId);
          if (!posting) continue;
          const entries = await this.entries.find({
            where: { shortlistId: shortlist.id },
            order: { rank: 'ASC' },
          });
          const applications =
            entries.length === 0
              ? []
              : await this.applications.find({
                  where: { id: In(entries.map((entry) => entry.applicationId)) },
                });
          const applicationsById = new Map(
            applications.map((application) => [application.id, application]),
          );
          const candidateIds = applications.map((application) => application.candidateId);
          const candidates =
            candidateIds.length > 0
              ? await this.candidates.find({ where: { id: In(candidateIds) } })
              : [];
          const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
          records.push({
            shortlist,
            posting,
            entries: entries.map((entry) => {
              const application = applicationsById.get(entry.applicationId) ?? null;
              return {
                entry,
                application,
                candidate: application
                  ? candidatesById.get(application.candidateId) ?? null
                  : null,
              };
            }),
          });
        }
        return records;
      },
    );
  }

  // The client's write. The entry is loaded in Tethr's workspace, but only
  // after verifying the posting belongs to the caller's organization; a
  // mismatched id is reported as not-found rather than forbidden so the
  // projection does not confirm what it hides.
  async recordDecision(input: RecordShortlistDecisionData): Promise<ShortlistEntry> {
    const clientOrganizationId = this.tenantContext.getOrganizationId();
    const tethrOrganizationId = await this.platformScope.resolveTethrOrganizationId();
    if (clientOrganizationId === tethrOrganizationId) {
      throw new NotFoundError('Shortlist entry not found', { id: input.shortlistEntryId });
    }
    return this.platformScope.switchTo(
      {
        organizationId: tethrOrganizationId,
        purpose: 'shortlist decision',
        resourceType: 'shortlist_entry',
        resourceId: input.shortlistEntryId,
      },
      async () => {
        const entry = await this.entries.findById(input.shortlistEntryId);
        if (!entry) {
          throw new NotFoundError('Shortlist entry not found', { id: input.shortlistEntryId });
        }
        const shortlist = await this.shortlists.findById(entry.shortlistId);
        if (!shortlist) {
          throw new NotFoundError('Shortlist entry not found', { id: input.shortlistEntryId });
        }
        const posting = await this.postings.findById(shortlist.jobPostingId);
        if (!posting || posting.sourceOrganizationId !== clientOrganizationId) {
          throw new NotFoundError('Shortlist entry not found', { id: input.shortlistEntryId });
        }
        if (shortlist.status !== 'presented' && shortlist.status !== 'feedbackReceived') {
          throw new ConflictError('This shortlist is not open for feedback');
        }
        entry.clientDecision = input.decision;
        entry.clientNote = input.note ?? null;
        entry.decidedAt = input.decision === 'pending' ? null : new Date();
        const saved = await this.entries.save(entry);
        if (shortlist.status === 'presented') {
          shortlist.status = 'feedbackReceived';
          await this.shortlists.save(shortlist);
        }
        return saved;
      },
    );
  }

  private async getById(shortlistId: string): Promise<Shortlist> {
    const shortlist = await this.shortlists.findById(shortlistId);
    if (!shortlist) {
      throw new NotFoundError('Shortlist not found', { id: shortlistId });
    }
    return shortlist;
  }

  private async nextRoundNumber(jobPostingId: string): Promise<number> {
    const existing = await this.shortlists.find({ where: { jobPostingId } });
    return existing.reduce((max, shortlist) => Math.max(max, shortlist.roundNumber), 0) + 1;
  }

  private async withEntries(shortlists: readonly Shortlist[]): Promise<ShortlistRecord[]> {
    if (shortlists.length === 0) return [];
    const entries = await this.entries.find({
      where: { shortlistId: In(shortlists.map((shortlist) => shortlist.id)) },
      order: { rank: 'ASC' },
    });
    const byShortlist = new Map<string, ShortlistEntry[]>();
    for (const entry of entries) {
      byShortlist.set(entry.shortlistId, [...(byShortlist.get(entry.shortlistId) ?? []), entry]);
    }
    return shortlists.map((shortlist) => ({
      shortlist,
      entries: byShortlist.get(shortlist.id) ?? [],
    }));
  }
}
