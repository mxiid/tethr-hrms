import { type ShortlistDecision } from '@hrms/shared';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { PERMISSIONS } from '../../core/authz/permissions';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { AtsService } from './ats.service';
import {
  CreateShortlistInput,
  RecordShortlistDecisionInput,
  ShortlistIdInput,
} from './dto/shortlist.inputs';
import {
  ClientShortlistEntryView,
  ClientShortlistView,
  ShortlistDecisionResultView,
  ShortlistEntryView,
  ShortlistView,
} from './dto/shortlist.outputs';
import {
  ShortlistService,
  type ClientShortlistRecord,
  type ShortlistRecord,
} from './shortlist.service';

// Shortlists have two surfaces: the operator's (create, present, close — with
// internal ratings and notes) and the client's narrow projection (`myShortlists`
// and the per-entry verdict). The projection is computed server-side from the
// caller's own organization; it never accepts a client-supplied id.
@Resolver(() => ShortlistView)
export class ShortlistResolver {
  constructor(
    private readonly shortlistService: ShortlistService,
    private readonly ats: AtsService,
  ) {}

  @Query(() => [ShortlistView])
  @RequirePermissions(PERMISSIONS.shortlistRead)
  async shortlists(
    @Args('jobPostingId', { type: () => ID }) jobPostingId: string,
  ): Promise<ShortlistView[]> {
    const records = await this.shortlistService.listForPosting(jobPostingId);
    return this.toShortlistViews(records);
  }

  @Mutation(() => ShortlistView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async createShortlist(@Args('input') input: CreateShortlistInput): Promise<ShortlistView> {
    const record = await this.shortlistService.createShortlist({
      jobPostingId: input.jobPostingId,
      applicationIds: input.applicationIds,
      roundNumber: input.roundNumber ?? null,
    });
    const [view] = await this.toShortlistViews([record]);
    return view;
  }

  @Mutation(() => ShortlistView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async presentShortlist(@Args('input') input: ShortlistIdInput): Promise<ShortlistView> {
    const record = await this.shortlistService.present(input.shortlistId);
    const [view] = await this.toShortlistViews([record]);
    return view;
  }

  @Mutation(() => ShortlistView)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async closeShortlist(@Args('input') input: ShortlistIdInput): Promise<ShortlistView> {
    const record = await this.shortlistService.close(input.shortlistId);
    const [view] = await this.toShortlistViews([record]);
    return view;
  }

  @Query(() => [ClientShortlistView])
  @RequirePermissions(PERMISSIONS.shortlistRead)
  async myShortlists(): Promise<ClientShortlistView[]> {
    const records = await this.shortlistService.listPresentedForClientOrganization();
    return records.map((record) => this.toClientShortlistView(record));
  }

  @Mutation(() => ShortlistDecisionResultView)
  @RequirePermissions(PERMISSIONS.shortlistDecide)
  async recordShortlistDecision(
    @Args('input') input: RecordShortlistDecisionInput,
  ): Promise<ShortlistDecisionResultView> {
    const entry = await this.shortlistService.recordDecision({
      shortlistEntryId: input.shortlistEntryId,
      decision: input.decision as ShortlistDecision,
      note: input.note ?? null,
    });
    return {
      shortlistEntryId: entry.id,
      clientDecision: entry.clientDecision,
      clientNote: entry.clientNote,
    };
  }

  private async toShortlistViews(records: readonly ShortlistRecord[]): Promise<ShortlistView[]> {
    if (records.length === 0) return [];
    const postingIds = [...new Set(records.map((record) => record.shortlist.jobPostingId))];
    const postingsById = await this.ats.postingsByIds(postingIds);
    const applicationIds = [
      ...new Set(records.flatMap((record) => record.entries.map((entry) => entry.applicationId))),
    ];
    const applicationsById = await this.ats.applicationsByIds(applicationIds);
    const candidateIds = [
      ...new Set([...applicationsById.values()].map((application) => application.candidateId)),
    ];
    const [candidatesById, withResume] = await Promise.all([
      this.ats.candidatesByIds(candidateIds),
      this.ats.resumePresenceByCandidateIds(candidateIds),
    ]);

    const views: ShortlistView[] = [];
    for (const record of records) {
      const entries: ShortlistEntryView[] = [];
      for (const entry of record.entries) {
        const application = applicationsById.get(entry.applicationId) ?? null;
        const candidate = application ? candidatesById.get(application.candidateId) ?? null : null;
        entries.push({
          id: entry.id,
          applicationId: entry.applicationId,
          candidateId: candidate?.id ?? '',
          candidateName: candidate?.fullName ?? 'Unknown candidate',
          candidateEmail: candidate?.email ?? '',
          currentTitle: application?.currentTitle ?? null,
          yearsExperience: application?.yearsExperience ?? null,
          location: application?.location ?? null,
          expectedSalary:
            application?.expectedSalary === null || application?.expectedSalary === undefined
              ? null
              : Number(application.expectedSalary),
          salaryCurrency: application?.salaryCurrency ?? null,
          manualRating: application?.manualRating ?? null,
          rank: entry.rank,
          clientDecision: entry.clientDecision,
          clientNote: entry.clientNote,
          hasResume: application ? withResume.has(application.candidateId) : false,
        });
      }
      views.push({
        id: record.shortlist.id,
        jobPostingId: record.shortlist.jobPostingId,
        jobPostingTitle: postingsById.get(record.shortlist.jobPostingId)?.title ?? 'Unknown role',
        roundNumber: record.shortlist.roundNumber,
        status: record.shortlist.status,
        presentedAt: record.shortlist.presentedAt?.toISOString() ?? null,
        closedAt: record.shortlist.closedAt?.toISOString() ?? null,
        createdAt: record.shortlist.createdAt.toISOString(),
        entries,
      });
    }
    return views;
  }

  private toClientShortlistView(record: ClientShortlistRecord): ClientShortlistView {
    const entries: ClientShortlistEntryView[] = record.entries.map(({ entry, application, candidate }) => ({
      id: entry.id,
      candidateName: candidate?.fullName ?? 'Candidate',
      currentTitle: application?.currentTitle ?? null,
      yearsExperience: application?.yearsExperience ?? null,
      location: application?.location ?? null,
      skills: application?.skills ?? null,
      coverNote: application?.coverNote ?? null,
      expectedSalary:
        application?.expectedSalary === null || application?.expectedSalary === undefined
          ? null
          : Number(application.expectedSalary),
      salaryCurrency: application?.salaryCurrency ?? null,
      rank: entry.rank,
      clientDecision: entry.clientDecision,
      clientNote: entry.clientNote,
    }));
    return {
      id: record.shortlist.id,
      jobPostingTitle: record.posting.title,
      roundNumber: record.shortlist.roundNumber,
      status: record.shortlist.status,
      presentedAt: record.shortlist.presentedAt?.toISOString() ?? null,
      entries,
    };
  }
}
