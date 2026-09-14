import { toId, type InterviewOutcome, type InterviewStatus, type UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import {
  APPLICATION_REPOSITORY,
  INTERVIEW_FEEDBACK_REPOSITORY,
  INTERVIEW_FEEDBACK_SKILL_REPOSITORY,
  INTERVIEW_PANEL_MEMBER_REPOSITORY,
  INTERVIEW_REPOSITORY,
  INTERVIEW_ROUND_REPOSITORY,
  JOB_POSTING_REPOSITORY,
} from './ats.tokens';
import { Application } from './entities/application.entity';
import { InterviewFeedbackSkill } from './entities/interview-feedback-skill.entity';
import { InterviewFeedback } from './entities/interview-feedback.entity';
import { InterviewPanelMember } from './entities/interview-panel-member.entity';
import { InterviewRound } from './entities/interview-round.entity';
import { Interview } from './entities/interview.entity';
import { JobPosting } from './entities/job-posting.entity';

export type CreateInterviewRoundData = {
  readonly name: string;
  readonly orderIndex?: number | null;
  readonly skills?: readonly string[];
  readonly expectedRating?: number | null;
};

export type ScheduleInterviewPanelMember = {
  readonly userId?: string | null;
  readonly externalName?: string | null;
  readonly externalEmail?: string | null;
};

export type ScheduleInterviewData = {
  readonly applicationId: string;
  readonly interviewRoundId: string;
  readonly scheduledAt: string;
  readonly panel: readonly ScheduleInterviewPanelMember[];
  readonly scheduledByUserId: UserId;
  readonly notes?: string | null;
};

export type FeedbackScoreInput = {
  readonly skill: string;
  readonly score: number;
};

export type RecordFeedbackData = {
  readonly interviewId: string;
  readonly panelMemberId: string;
  readonly scores: readonly FeedbackScoreInput[];
  readonly overallNote?: string | null;
  readonly recordedByUserId: UserId;
};

export type InterviewDetail = {
  readonly interview: Interview;
  readonly round: InterviewRound;
  readonly application: Application;
  readonly panel: readonly InterviewPanelMember[];
  readonly panelDisplayNames: ReadonlyMap<string, string>;
  readonly feedbacks: readonly InterviewFeedback[];
  readonly skillsByFeedback: ReadonlyMap<string, readonly InterviewFeedbackSkill[]>;
  readonly average: number | null;
  readonly skillAverages: readonly { readonly skill: string; readonly average: number }[];
};

export type ClientInterviewOutcome = {
  readonly interviewId: string;
  readonly roundName: string;
  readonly scheduledAt: Date;
  readonly status: InterviewStatus;
  readonly outcome: InterviewOutcome | null;
  readonly jobPostingTitle: string;
};

// Interviews and scorecards. Panel membership (internal user OR external
// person), one feedback per panellist (withdraw to refile), and no feedback
// before the scheduled slot are enforced here; averages are computed on read so
// they can never go stale.
@Injectable()
export class InterviewService {
  constructor(
    @Inject(INTERVIEW_ROUND_REPOSITORY)
    private readonly rounds: TenantScopedRepository<InterviewRound>,
    @Inject(INTERVIEW_REPOSITORY) private readonly interviews: TenantScopedRepository<Interview>,
    @Inject(INTERVIEW_PANEL_MEMBER_REPOSITORY)
    private readonly panel: TenantScopedRepository<InterviewPanelMember>,
    @Inject(INTERVIEW_FEEDBACK_REPOSITORY)
    private readonly feedbacks: TenantScopedRepository<InterviewFeedback>,
    @Inject(INTERVIEW_FEEDBACK_SKILL_REPOSITORY)
    private readonly feedbackSkills: TenantScopedRepository<InterviewFeedbackSkill>,
    @Inject(APPLICATION_REPOSITORY)
    private readonly applications: TenantScopedRepository<Application>,
    @Inject(JOB_POSTING_REPOSITORY) private readonly postings: TenantScopedRepository<JobPosting>,
    private readonly auth: AuthService,
    private readonly platformScope: PlatformScopeService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // --- Round templates ----------------------------------------------------------

  async createRound(input: CreateInterviewRoundData): Promise<InterviewRound> {
    const name = input.name.trim();
    if (!name) {
      throw new ValidationFailedError('A round needs a name');
    }
    const existing = await this.rounds.find();
    const orderIndex = input.orderIndex ?? existing.length + 1;
    return this.rounds.save(
      this.rounds.create({
        name,
        orderIndex,
        skills: [...(input.skills ?? [])],
        expectedRating:
          input.expectedRating === null || input.expectedRating === undefined
            ? null
            : input.expectedRating.toFixed(1),
      }),
    );
  }

  listRounds(): Promise<InterviewRound[]> {
    return this.rounds.find({ order: { orderIndex: 'ASC' } });
  }

  // Zero-setup default template: a three-step sequence with sensible skill sets,
  // created on first use so scheduling works before anyone configures rounds.
  async ensureDefaultRounds(): Promise<InterviewRound[]> {
    const existing = await this.listRounds();
    if (existing.length > 0) return existing;
    const defaults = [
      { name: 'Screening call', skills: ['Communication', 'Motivation'] },
      {
        name: 'Technical interview',
        skills: ['Technical depth', 'Problem solving', 'Code quality'],
      },
      { name: 'Final interview', skills: ['Culture fit', 'Ownership'] },
    ];
    const rounds: InterviewRound[] = [];
    for (const [index, definition] of defaults.entries()) {
      rounds.push(
        await this.createRound({
          name: definition.name,
          orderIndex: index + 1,
          skills: definition.skills,
        }),
      );
    }
    return rounds;
  }

  // --- Scheduling ---------------------------------------------------------------

  async schedule(input: ScheduleInterviewData): Promise<InterviewDetail> {
    const application = await this.applications.findById(input.applicationId);
    if (!application) {
      throw new NotFoundError('Application not found', { id: input.applicationId });
    }
    const round = await this.rounds.findById(input.interviewRoundId);
    if (!round) {
      throw new NotFoundError('Interview round not found', { id: input.interviewRoundId });
    }
    if (input.panel.length === 0) {
      throw new ValidationFailedError('An interview needs at least one panellist');
    }
    for (const member of input.panel) {
      const hasUser = typeof member.userId === 'string' && member.userId.length > 0;
      const hasName = typeof member.externalName === 'string' && member.externalName.trim() !== '';
      if (!hasUser && !hasName) {
        throw new ValidationFailedError('Each panellist needs a user or a name');
      }
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new ValidationFailedError('scheduledAt must be a valid date');
    }

    const interview = await this.interviews.save(
      this.interviews.create({
        organizationId: this.tenantContext.getOrganizationId(),
        applicationId: input.applicationId,
        interviewRoundId: input.interviewRoundId,
        scheduledAt,
        status: 'scheduled',
        outcome: null,
        notes: input.notes ?? null,
        scheduledByUserId: input.scheduledByUserId,
      }),
    );
    for (const member of input.panel) {
      await this.panel.save(
        this.panel.create({
          organizationId: this.tenantContext.getOrganizationId(),
          interviewId: interview.id,
          userId: member.userId ? toId<UserId>(member.userId) : null,
          externalName: member.externalName?.trim() || null,
          externalEmail: member.externalEmail?.trim() || null,
        }),
      );
    }

    // Scheduling an interview moves the application into the interviewing stage.
    if (application.stage !== 'interviewing') {
      application.stage = 'interviewing';
      await this.applications.save(application);
    }

    const detail = await this.getInterview(interview.id);
    if (!detail) throw new NotFoundError('Interview not found', { id: interview.id });
    return detail;
  }

  async updateStatus(input: {
    readonly interviewId: string;
    readonly status?: InterviewStatus;
    readonly outcome?: InterviewOutcome | null;
    readonly notes?: string | null;
  }): Promise<Interview> {
    const interview = await this.getById(input.interviewId);
    if (input.status !== undefined) interview.status = input.status;
    if (input.outcome !== undefined) interview.outcome = input.outcome;
    if (input.notes !== undefined) interview.notes = input.notes;
    return this.interviews.save(interview);
  }

  // --- Feedback -----------------------------------------------------------------

  async recordFeedback(input: RecordFeedbackData): Promise<InterviewFeedback> {
    const interview = await this.getById(input.interviewId);
    const member = await this.panel.findById(input.panelMemberId);
    if (!member || member.interviewId !== interview.id) {
      throw new NotFoundError('That panellist is not on this interview', {
        id: input.panelMemberId,
      });
    }
    if (new Date() < interview.scheduledAt) {
      throw new ConflictError('Feedback cannot be filed before the interview takes place');
    }
    if (input.scores.length === 0) {
      throw new ValidationFailedError('A scorecard needs at least one skill score');
    }
    for (const score of input.scores) {
      if (score.score < 1 || score.score > 5) {
        throw new ValidationFailedError('Skill scores are 1–5');
      }
    }
    const existing = await this.feedbacks.find({
      where: { interviewId: interview.id, panelMemberId: member.id },
    });
    if (existing.some((feedback) => feedback.withdrawnAt === null)) {
      throw new ConflictError('This panellist already filed a scorecard — withdraw it to refile');
    }
    // Tethr records on the client's behalf, so there is no "session user must be
    // the interviewer" check; `recordedByUserId` keeps the audit attribution.
    const feedback = await this.feedbacks.save(
      this.feedbacks.create({
        organizationId: this.tenantContext.getOrganizationId(),
        interviewId: interview.id,
        panelMemberId: member.id,
        recordedByUserId: input.recordedByUserId,
        overallNote: input.overallNote ?? null,
        submittedAt: new Date(),
        withdrawnAt: null,
      }),
    );
    for (const score of input.scores) {
      await this.feedbackSkills.save(
        this.feedbackSkills.create({
          organizationId: this.tenantContext.getOrganizationId(),
          feedbackId: feedback.id,
          skill: score.skill,
          score: score.score,
        }),
      );
    }
    return feedback;
  }

  async withdrawFeedback(feedbackId: string): Promise<void> {
    const feedback = await this.feedbacks.findById(feedbackId);
    if (!feedback || feedback.withdrawnAt !== null) {
      throw new NotFoundError('Scorecard not found', { id: feedbackId });
    }
    feedback.withdrawnAt = new Date();
    await this.feedbacks.save(feedback);
  }

  // --- Reads --------------------------------------------------------------------

  async listInterviews(): Promise<InterviewDetail[]> {
    const interviews = await this.interviews.find({ order: { scheduledAt: 'DESC' } });
    return this.assemble(interviews);
  }

  // The client's read-only projection: that interviews happened and their
  // outcomes, for applications tied to their own postings — no panellists, no
  // scorecards, no notes.
  async listOutcomesForClientOrganization(): Promise<ClientInterviewOutcome[]> {
    const clientOrganizationId = this.tenantContext.getOrganizationId();
    const tethrOrganizationId = await this.platformScope.resolveTethrOrganizationId();
    if (clientOrganizationId === tethrOrganizationId) {
      return [];
    }
    return this.platformScope.switchTo(
      {
        organizationId: tethrOrganizationId,
        purpose: 'interview outcomes read',
        resourceType: 'interview',
        resourceId: clientOrganizationId,
      },
      async () => {
        const postings = await this.postings.find({
          where: { sourceOrganizationId: clientOrganizationId },
        });
        if (postings.length === 0) return [];
        const postingsById = new Map(postings.map((posting) => [posting.id, posting]));
        const applications = await this.applications.find({
          where: { jobPostingId: In(postings.map((posting) => posting.id)) },
        });
        if (applications.length === 0) return [];
        const interviews = await this.interviews.find({
          where: { applicationId: In(applications.map((application) => application.id)) },
          order: { scheduledAt: 'DESC' },
        });
        if (interviews.length === 0) return [];
        const rounds = await this.rounds.find({
          where: { id: In(interviews.map((interview) => interview.interviewRoundId)) },
        });
        const roundsById = new Map(rounds.map((round) => [round.id, round]));
        const applicationsById = new Map(
          applications.map((application) => [application.id, application]),
        );
        return interviews.flatMap((interview) => {
          const round = roundsById.get(interview.interviewRoundId);
          const application = applicationsById.get(interview.applicationId);
          if (!round || !application) return [];
          return [
            {
              interviewId: interview.id,
              roundName: round.name,
              scheduledAt: interview.scheduledAt,
              status: interview.status,
              outcome: interview.outcome,
              jobPostingTitle: postingsById.get(application.jobPostingId)?.title ?? 'Unknown role',
            },
          ];
        });
      },
    );
  }

  private async getById(interviewId: string): Promise<Interview> {
    const interview = await this.interviews.findById(interviewId);
    if (!interview) {
      throw new NotFoundError('Interview not found', { id: interviewId });
    }
    return interview;
  }

  async getInterview(interviewId: string): Promise<InterviewDetail | null> {
    const interview = await this.interviews.findById(interviewId);
    if (!interview) return null;
    const [detail] = await this.assemble([interview]);
    return detail ?? null;
  }

  private async assemble(interviews: readonly Interview[]): Promise<InterviewDetail[]> {
    if (interviews.length === 0) return [];
    const interviewIds = interviews.map((interview) => interview.id);
    const [rounds, applications, panel, feedbacks] = await Promise.all([
      this.rounds.find({ where: { id: In(interviews.map((i) => i.interviewRoundId)) } }),
      this.applications.find({ where: { id: In(interviews.map((i) => i.applicationId)) } }),
      this.panel.find({ where: { interviewId: In(interviewIds) } }),
      this.feedbacks.find({ where: { interviewId: In(interviewIds) } }),
    ]);
    const activeFeedbacks = feedbacks.filter((feedback) => feedback.withdrawnAt === null);
    const skills =
      activeFeedbacks.length === 0
        ? []
        : await this.feedbackSkills.find({
            where: { feedbackId: In(activeFeedbacks.map((feedback) => feedback.id)) },
          });
    const roundsById = new Map(rounds.map((round) => [round.id, round]));
    const applicationsById = new Map(
      applications.map((application) => [application.id, application]),
    );
    const skillsByFeedback = new Map<string, InterviewFeedbackSkill[]>();
    for (const skill of skills) {
      skillsByFeedback.set(skill.feedbackId, [
        ...(skillsByFeedback.get(skill.feedbackId) ?? []),
        skill,
      ]);
    }
    const panelDisplayNames = new Map<string, string>();
    for (const member of panel) {
      if (member.userId) {
        const user = await this.auth.getUserById(member.userId);
        panelDisplayNames.set(member.id, user?.email ?? 'Internal panellist');
      } else {
        panelDisplayNames.set(member.id, member.externalName ?? 'External panellist');
      }
    }

    return interviews.flatMap((interview) => {
      const round = roundsById.get(interview.interviewRoundId);
      const application = applicationsById.get(interview.applicationId);
      if (!round || !application) return [];
      const interviewFeedbacks = activeFeedbacks.filter(
        (feedback) => feedback.interviewId === interview.id,
      );
      const perFeedback = interviewFeedbacks.map((feedback) => {
        const rows = skillsByFeedback.get(feedback.id) ?? [];
        return rows.length === 0
          ? null
          : rows.reduce((total, row) => total + row.score, 0) / rows.length;
      });
      const rated = perFeedback.filter((value): value is number => value !== null);
      const average =
        rated.length === 0 ? null : rated.reduce((total, value) => total + value, 0) / rated.length;

      const skillTotals = new Map<string, { total: number; count: number }>();
      for (const feedback of interviewFeedbacks) {
        for (const row of skillsByFeedback.get(feedback.id) ?? []) {
          const current = skillTotals.get(row.skill) ?? { total: 0, count: 0 };
          skillTotals.set(row.skill, { total: current.total + row.score, count: current.count + 1 });
        }
      }
      return [
        {
          interview,
          round,
          application,
          panel: panel.filter((member) => member.interviewId === interview.id),
          panelDisplayNames,
          feedbacks: interviewFeedbacks,
          skillsByFeedback,
          average,
          skillAverages: [...skillTotals.entries()].map(([skill, value]) => ({
            skill,
            average: value.total / value.count,
          })),
        },
      ];
    });
  }
}
