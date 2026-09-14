import { toId, type InterviewOutcome, type InterviewStatus, type UserId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthService } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { AtsService } from './ats.service';
import {
  CreateInterviewRoundInput,
  FeedbackIdInput,
  RecordInterviewFeedbackInput,
  ScheduleInterviewInput,
  UpdateInterviewInput,
} from './dto/interview.inputs';
import {
  ClientInterviewOutcomeView,
  InterviewFeedbackView,
  InterviewRoundView,
  InterviewView,
} from './dto/interview.outputs';
import type { InterviewRound } from './entities/interview-round.entity';
import { InterviewService, type InterviewDetail } from './interview.service';

@Resolver(() => InterviewView)
export class InterviewResolver {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly authService: AuthService,
    private readonly ats: AtsService,
  ) {}

  @Query(() => [InterviewRoundView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async interviewRounds(): Promise<InterviewRoundView[]> {
    return (await this.interviewService.ensureDefaultRounds()).map((round) =>
      this.toRoundView(round),
    );
  }

  @Query(() => [InterviewView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateRead)
  async interviews(): Promise<InterviewView[]> {
    const details = await this.interviewService.listInterviews();
    return this.toInterviewViews(details);
  }

  @Query(() => [ClientInterviewOutcomeView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.shortlistRead)
  async myInterviewOutcomes(): Promise<ClientInterviewOutcomeView[]> {
    return (await this.interviewService.listOutcomesForClientOrganization()).map((outcome) => ({
      interviewId: outcome.interviewId,
      roundName: outcome.roundName,
      jobPostingTitle: outcome.jobPostingTitle,
      scheduledAt: outcome.scheduledAt.toISOString(),
      status: outcome.status,
      outcome: outcome.outcome,
    }));
  }

  @Mutation(() => InterviewRoundView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async createInterviewRound(
    @Args('input') input: CreateInterviewRoundInput,
  ): Promise<InterviewRoundView> {
    const round = await this.interviewService.createRound({
      name: input.name,
      orderIndex: input.orderIndex ?? null,
      skills: input.skills ?? [],
      expectedRating: input.expectedRating ?? null,
    });
    return this.toRoundView(round);
  }

  @Mutation(() => InterviewView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async scheduleInterview(@Args('input') input: ScheduleInterviewInput): Promise<InterviewView> {
    const user = await this.authService.getCurrentUser();
    const detail = await this.interviewService.schedule({
      applicationId: input.applicationId,
      interviewRoundId: input.interviewRoundId,
      scheduledAt: input.scheduledAt,
      panel: input.panel.map((member) => ({
        userId: member.userId ?? null,
        externalName: member.externalName ?? null,
        externalEmail: member.externalEmail ?? null,
      })),
      scheduledByUserId: toId<UserId>(user.id),
      notes: input.notes ?? null,
    });
    const [view] = await this.toInterviewViews([detail]);
    return view;
  }

  @Mutation(() => InterviewView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async updateInterview(@Args('input') input: UpdateInterviewInput): Promise<InterviewView> {
    await this.interviewService.updateStatus({
      interviewId: input.interviewId,
      status: input.status as InterviewStatus | undefined,
      outcome: input.outcome as InterviewOutcome | null | undefined,
      notes: input.notes,
    });
    const detail = await this.interviewService.getInterview(input.interviewId);
    if (!detail) {
      throw new Error('Interview not found after update');
    }
    const [view] = await this.toInterviewViews([detail]);
    return view;
  }

  @Mutation(() => InterviewFeedbackView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async recordInterviewFeedback(
    @Args('input') input: RecordInterviewFeedbackInput,
  ): Promise<InterviewFeedbackView> {
    const user = await this.authService.getCurrentUser();
    const feedback = await this.interviewService.recordFeedback({
      interviewId: input.interviewId,
      panelMemberId: input.panelMemberId,
      scores: input.scores,
      overallNote: input.overallNote ?? null,
      recordedByUserId: toId<UserId>(user.id),
    });
    return {
      id: feedback.id,
      panelMemberId: feedback.panelMemberId,
      recordedByUserId: feedback.recordedByUserId,
      overallNote: feedback.overallNote,
      submittedAt: feedback.submittedAt.toISOString(),
      average:
        input.scores.length === 0
          ? null
          : input.scores.reduce((total, score) => total + score.score, 0) / input.scores.length,
      scores: input.scores.map((score) => ({ skill: score.skill, score: score.score })),
    };
  }

  @Mutation(() => Boolean)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.candidateManage)
  async withdrawInterviewFeedback(@Args('input') input: FeedbackIdInput): Promise<boolean> {
    await this.interviewService.withdrawFeedback(input.feedbackId);
    return true;
  }

  private toRoundView(round: InterviewRound): InterviewRoundView {
    return {
      id: round.id,
      name: round.name,
      orderIndex: round.orderIndex,
      skills: round.skills,
      expectedRating: round.expectedRating === null ? null : Number(round.expectedRating),
    };
  }

  private async toInterviewViews(details: readonly InterviewDetail[]): Promise<InterviewView[]> {
    if (details.length === 0) return [];
    const candidateIds = [
      ...new Set(details.map((detail) => detail.application.candidateId).filter(Boolean)),
    ];
    const postingIds = [
      ...new Set(details.map((detail) => detail.application.jobPostingId).filter(Boolean)),
    ];
    const candidatesById = await this.ats.candidatesByIds(candidateIds);
    const postingsById = await this.ats.postingsByIds(postingIds);
    return details.map((detail) => ({
      id: detail.interview.id,
      applicationId: detail.interview.applicationId,
      candidateName: candidatesById.get(detail.application.candidateId)?.fullName ?? 'Candidate',
      jobPostingTitle:
        postingsById.get(detail.application.jobPostingId)?.title ?? detail.round.name,
      round: this.toRoundView(detail.round),
      scheduledAt: detail.interview.scheduledAt.toISOString(),
      status: detail.interview.status,
      outcome: detail.interview.outcome,
      notes: detail.interview.notes,
      average: detail.average,
      skillAverages: detail.skillAverages.map((entry) => ({
        skill: entry.skill,
        average: entry.average,
      })),
      panel: detail.panel.map((member) => ({
        id: member.id,
        userId: member.userId,
        displayName: detail.panelDisplayNames.get(member.id) ?? 'Panellist',
        externalEmail: member.externalEmail,
        hasFiledFeedback: detail.feedbacks.some(
          (feedback) => feedback.panelMemberId === member.id,
        ),
      })),
      feedbacks: detail.feedbacks.map((feedback) => {
        const scores = detail.skillsByFeedback.get(feedback.id) ?? [];
        const average =
          scores.length === 0
            ? null
            : scores.reduce((total, score) => total + score.score, 0) / scores.length;
        return {
          id: feedback.id,
          panelMemberId: feedback.panelMemberId,
          recordedByUserId: feedback.recordedByUserId,
          overallNote: feedback.overallNote,
          submittedAt: feedback.submittedAt.toISOString(),
          average,
          scores: scores.map((score) => ({ skill: score.skill, score: score.score })),
        } satisfies InterviewFeedbackView;
      }),
      feedbacksExpected: detail.panel.length,
    }));
  }
}
