import { toId, type HiringRequestId, type JobPostingId, type OrganizationId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { FormTokenService } from '../../core/auth/form-token.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { AtsService } from './ats.service';
import { ApplicationView } from './dto/application.output';
import { CreateCandidateInput, PublishHiringRequestInput, UpdateApplicationInput } from './dto/ats.inputs';
import { CandidateDetailView, CandidateView, JobPostingView, PublishedPostingView } from './dto/candidate.output';
import type { Application } from './entities/application.entity';
import type { Candidate } from './entities/candidate.entity';
import type { JobPosting } from './entities/job-posting.entity';

// The ATS operator surface: the candidate pool, applications and postings are
// Tethr-only (candidate:read/candidate:manage never reach client roles). The
// apply link carries the posting id as its signed context.
@Resolver(() => CandidateView)
export class AtsResolver {
  constructor(
    private readonly ats: AtsService,
    private readonly formTokens: FormTokenService,
  ) {}

  @Query(() => [CandidateView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async candidates(): Promise<CandidateView[]> {
    const [candidates, applications] = await Promise.all([
      this.ats.listCandidates(),
      this.ats.listApplications(),
    ]);
    const counts = new Map<string, number>();
    for (const application of applications) {
      counts.set(application.candidateId, (counts.get(application.candidateId) ?? 0) + 1);
    }
    return candidates.map((candidate) => this.toCandidateView(candidate, counts.get(candidate.id) ?? 0));
  }

  @Query(() => CandidateDetailView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async candidate(@Args('id', { type: () => ID }) id: string): Promise<CandidateDetailView> {
    const candidate = await this.ats.getCandidate(toId(id));
    const applications = await this.ats.applicationsForCandidate(toId(candidate.id));
    return {
      ...this.toCandidateView(candidate, applications.length),
      applications: await this.toApplicationViews(applications),
    };
  }

  @Query(() => [JobPostingView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async jobPostings(): Promise<JobPostingView[]> {
    return (await this.ats.listPostings()).map((posting) => this.toPostingView(posting));
  }

  // Applications for one posting: what the shortlist builder ranks from.
  @Query(() => [ApplicationView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async postingApplications(
    @Args('jobPostingId', { type: () => ID }) jobPostingId: string,
  ): Promise<ApplicationView[]> {
    return this.toApplicationViews(await this.ats.applicationsForPosting(toId(jobPostingId)));
  }

  // Applications ready for scheduling (shortlisted / interviewing).
  @Query(() => [ApplicationView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async shortlistReadyApplications(): Promise<ApplicationView[]> {
    return this.toApplicationViews(await this.ats.shortlistReadyApplications());
  }

  // Publishes the client's request as a posting and returns the signed apply
  // link in one step — the operator's whole "go live" action.
  @Mutation(() => PublishedPostingView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestManage)
  async publishHiringRequest(
    @Args('input') input: PublishHiringRequestInput,
  ): Promise<PublishedPostingView> {
    const posting = await this.ats.publishPostingFromRequest(
      toId<HiringRequestId>(input.hiringRequestId),
      input.organizationId ? toId<OrganizationId>(input.organizationId) : null,
    );
    const { formId } = await this.ats.applicationFormForPosting(toId<JobPostingId>(posting.id));
    const token = this.formTokens.mint({
      formId,
      organizationId: toId(posting.organizationId),
      refId: posting.id,
    });
    return { jobPostingId: posting.id, title: posting.title, applyPath: `/apply/${token}` };
  }

  // Takes a live posting off the air without touching its request. Closing the
  // request does this automatically; this is the manual lever (and the only one
  // for a client-cancelled request, whose posting lives in Tethr's workspace).
  @Mutation(() => JobPostingView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestManage)
  async unpublishJobPosting(
    @Args('postingId', { type: () => ID }) postingId: string,
  ): Promise<JobPostingView> {
    return this.toPostingView(await this.ats.unpublishPosting(toId<JobPostingId>(postingId)));
  }

  // Live posting state for a request (null when it was never published), so the
  // operator panel shows the truth after a reload.
  @Query(() => JobPostingView, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.hiringRequestManage)
  async postingForRequest(
    @Args('hiringRequestId', { type: () => ID }) hiringRequestId: string,
  ): Promise<JobPostingView | null> {
    const posting = await this.ats.getPostingForRequest(toId<HiringRequestId>(hiringRequestId));
    return posting ? this.toPostingView(posting) : null;
  }

  @Mutation(() => CandidateView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async createCandidate(@Args('input') input: CreateCandidateInput): Promise<CandidateView> {
    const candidate = await this.ats.createCandidate({
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      linkedin: input.linkedin ?? null,
      portfolio: input.portfolio ?? null,
      source: 'manual',
    });
    return this.toCandidateView(candidate, 0);
  }

  @Mutation(() => ApplicationView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async updateApplication(
    @Args('input') input: UpdateApplicationInput,
  ): Promise<ApplicationView> {
    const application = await this.ats.updateApplication({
      applicationId: input.applicationId,
      stage: input.stage as Application['stage'] | undefined,
      outcome: input.outcome as Application['outcome'] | undefined,
      onHold: input.onHold,
      holdReason: input.holdReason,
      manualRating: input.manualRating,
      notes: input.notes,
    });
    const [view] = await this.toApplicationViews([application]);
    return view;
  }

  private toCandidateView(candidate: Candidate, applicationCount: number): CandidateView {
    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      linkedin: candidate.linkedin,
      portfolio: candidate.portfolio,
      source: candidate.source,
      createdAt: candidate.createdAt.toISOString(),
      applicationCount,
    };
  }

  private async toApplicationViews(applications: readonly Application[]): Promise<ApplicationView[]> {
    const [postingsById, candidatesById, withResume] = await Promise.all([
      this.ats.postingsByIds(applications.map((application) => application.jobPostingId)),
      this.ats.candidatesByIds(applications.map((application) => application.candidateId)),
      this.ats.resumePresenceByCandidateIds(
        applications.map((application) => application.candidateId),
      ),
    ]);
    const views: ApplicationView[] = [];
    for (const application of applications) {
      views.push({
        id: application.id,
        candidateId: application.candidateId,
        candidateName: candidatesById.get(application.candidateId)?.fullName ?? 'Unknown candidate',
        jobPostingId: application.jobPostingId,
        jobPostingTitle: postingsById.get(application.jobPostingId)?.title ?? 'Unknown role',
        stage: application.stage,
        outcome: application.outcome,
        onHold: application.onHold,
        holdReason: application.holdReason,
        expectedSalary:
          application.expectedSalary === null ? null : Number(application.expectedSalary),
        salaryCurrency: application.salaryCurrency,
        currentSalary: application.currentSalary === null ? null : Number(application.currentSalary),
        currentTitle: application.currentTitle,
        yearsExperience: application.yearsExperience,
        location: application.location,
        skills: application.skills,
        coverNote: application.coverNote,
        manualRating: application.manualRating,
        notes: application.notes,
        hasResume: withResume.has(application.candidateId),
        createdAt: application.createdAt.toISOString(),
      });
    }
    return views;
  }

  private toPostingView(posting: JobPosting): JobPostingView {
    return {
      id: posting.id,
      title: posting.title,
      slug: posting.slug,
      isPublished: posting.isPublished,
      postedAt: posting.postedAt?.toISOString() ?? null,
      closesOn: posting.closesOn,
      salaryMin: posting.salaryMin === null ? null : Number(posting.salaryMin),
      salaryMax: posting.salaryMax === null ? null : Number(posting.salaryMax),
      salaryCurrency: posting.salaryCurrency,
      sourceHiringRequestId: posting.sourceHiringRequestId,
    };
  }
}
