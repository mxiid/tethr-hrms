import {
  toId,
  type AnnouncementAudience,
  type EmployeeFeedbackId,
  type EmployeeId,
  type FeedbackCategory,
  type FeedbackStatus,
  type UserId,
} from '@hrms/shared';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { ForbiddenError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { AuthorizationService } from '../../core/authz/authz.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { AnnouncementView } from './dto/announcement.output';
import { EmployeeFeedbackView } from './dto/employee-feedback.output';
import { PublishAnnouncementInput } from './dto/publish-announcement.input';
import { ResolveFeedbackInput } from './dto/resolve-feedback.input';
import { SubmitMyFeedbackInput } from './dto/submit-my-feedback.input';
import { EngagementService } from './engagement.service';
import { Announcement } from './entities/announcement.entity';
import { EmployeeFeedback } from './entities/employee-feedback.entity';

const toAnnouncementView = (announcement: Announcement): AnnouncementView => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  audience: announcement.audience,
  isPinned: announcement.isPinned,
  publishedAt: announcement.publishedAt.toISOString(),
  expiresAt: announcement.expiresAt?.toISOString() ?? null,
});

const toFeedbackView = (feedback: EmployeeFeedback): EmployeeFeedbackView => ({
  id: feedback.id,
  employeeId: feedback.employeeId,
  category: feedback.category,
  subject: feedback.subject,
  body: feedback.body,
  status: feedback.status,
  resolutionNote: feedback.resolutionNote,
  createdAt: feedback.createdAt.toISOString(),
  updatedAt: feedback.updatedAt.toISOString(),
});

@Resolver()
export class EngagementResolver {
  constructor(
    private readonly engagement: EngagementService,
    private readonly auth: AuthService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Query(() => [AnnouncementView])
  @RequirePermissions(PERMISSIONS.announcementRead)
  async announcements(): Promise<AnnouncementView[]> {
    const access = await this.authorization.getCurrentAccess();
    return (await this.engagement.listAnnouncements(access.portal)).map(toAnnouncementView);
  }

  @Mutation(() => AnnouncementView)
  @RequirePermissions(PERMISSIONS.announcementWrite)
  async publishAnnouncement(
    @Args('input') input: PublishAnnouncementInput,
  ): Promise<AnnouncementView> {
    const user = await this.auth.getCurrentUser();
    const announcement = await this.engagement.publishAnnouncement({
      title: input.title,
      body: input.body,
      audience: input.audience as AnnouncementAudience,
      isPinned: input.isPinned ?? false,
      expiresAt: input.expiresAt ?? null,
      publishedByUserId: toId<UserId>(user.id),
    });
    return toAnnouncementView(announcement);
  }

  @Query(() => [EmployeeFeedbackView])
  @RequirePermissions(PERMISSIONS.feedbackRead)
  async employeeFeedback(): Promise<EmployeeFeedbackView[]> {
    return (await this.engagement.listFeedback()).map(toFeedbackView);
  }

  @Mutation(() => EmployeeFeedbackView)
  @RequirePermissions(PERMISSIONS.feedbackWrite)
  async submitMyFeedback(
    @Args('input') input: SubmitMyFeedbackInput,
  ): Promise<EmployeeFeedbackView> {
    const user = await this.auth.getCurrentUser();
    if (!user.employeeId) {
      throw new ForbiddenError('Only users linked to an employee can submit employee feedback');
    }
    const feedback = await this.engagement.submitFeedback({
      employeeId: toId<EmployeeId>(user.employeeId),
      submittedByUserId: toId<UserId>(user.id),
      category: input.category as FeedbackCategory,
      subject: input.subject,
      body: input.body,
    });
    return toFeedbackView(feedback);
  }

  @Mutation(() => EmployeeFeedbackView)
  @RequirePermissions(PERMISSIONS.feedbackManage)
  async resolveEmployeeFeedback(
    @Args('input') input: ResolveFeedbackInput,
  ): Promise<EmployeeFeedbackView> {
    const user = await this.auth.getCurrentUser();
    const feedback = await this.engagement.resolveFeedback({
      employeeFeedbackId: toId<EmployeeFeedbackId>(input.employeeFeedbackId),
      status: input.status as FeedbackStatus,
      resolutionNote: input.resolutionNote,
      resolvedByUserId: toId<UserId>(user.id),
    });
    return toFeedbackView(feedback);
  }
}
