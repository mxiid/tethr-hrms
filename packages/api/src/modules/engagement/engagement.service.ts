import {
  toId,
  type AnnouncementAudience,
  type AnnouncementId,
  type EmployeeFeedbackId,
  type EmployeeId,
  type FeedbackCategory,
  type FeedbackStatus,
  type PortalKind,
  type UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type FindOptionsWhere } from 'typeorm';

import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { ANNOUNCEMENT_REPOSITORY, EMPLOYEE_FEEDBACK_REPOSITORY } from './engagement.tokens';
import { Announcement } from './entities/announcement.entity';
import { EmployeeFeedback } from './entities/employee-feedback.entity';

type PublishAnnouncementData = {
  readonly title: string;
  readonly body: string;
  readonly audience: AnnouncementAudience;
  readonly isPinned?: boolean;
  readonly expiresAt?: string | null;
  readonly publishedByUserId: UserId;
};

type SubmitFeedbackData = {
  readonly employeeId: EmployeeId;
  readonly submittedByUserId: UserId;
  readonly category: FeedbackCategory;
  readonly subject: string;
  readonly body: string;
};

type ResolveFeedbackData = {
  readonly employeeFeedbackId: EmployeeFeedbackId;
  readonly status: FeedbackStatus;
  readonly resolutionNote?: string | null;
  readonly resolvedByUserId: UserId;
};

@Injectable()
export class EngagementService {
  constructor(
    @Inject(ANNOUNCEMENT_REPOSITORY)
    private readonly announcements: TenantScopedRepository<Announcement>,
    @Inject(EMPLOYEE_FEEDBACK_REPOSITORY)
    private readonly feedback: TenantScopedRepository<EmployeeFeedback>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async publishAnnouncement(input: PublishAnnouncementData): Promise<Announcement> {
    const organizationId = this.tenantContext.getOrganizationId();
    const announcement = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Announcement, {
        organizationId,
        title: input.title,
        body: input.body,
        audience: input.audience,
        isPinned: input.isPinned ?? false,
        publishedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59.999Z`) : null,
        publishedByUserId: input.publishedByUserId,
      });
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'announcement.published',
        payload: {
          announcementId: toId<AnnouncementId>(saved.id),
          title: saved.title,
          audience: saved.audience,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'publish',
      resourceType: 'announcement',
      resourceId: announcement.id,
      after: { title: announcement.title, audience: announcement.audience },
    });
    return announcement;
  }

  async listAnnouncements(portal: PortalKind): Promise<Announcement[]> {
    const now = Date.now();
    const visibleAudiences = this.visibleAnnouncementAudiences(portal);
    const announcements = await this.announcements.find({
      order: { isPinned: 'DESC', publishedAt: 'DESC' },
    });
    return announcements.filter(
      (announcement) =>
        visibleAudiences.has(announcement.audience) &&
        (!announcement.expiresAt || announcement.expiresAt.getTime() >= now),
    );
  }

  async submitFeedback(input: SubmitFeedbackData): Promise<EmployeeFeedback> {
    const organizationId = this.tenantContext.getOrganizationId();
    const feedback = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(EmployeeFeedback, {
        organizationId,
        employeeId: input.employeeId,
        submittedByUserId: input.submittedByUserId,
        category: input.category,
        subject: input.subject,
        body: input.body,
        status: 'submitted',
        resolvedByUserId: null,
        resolutionNote: null,
      });
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'employeeFeedback.submitted',
        payload: {
          employeeFeedbackId: toId<EmployeeFeedbackId>(saved.id),
          employeeId: saved.employeeId,
          category: saved.category,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'submit',
      resourceType: 'employee_feedback',
      resourceId: feedback.id,
      after: { employeeId: feedback.employeeId, category: feedback.category },
    });
    return feedback;
  }

  listFeedback(): Promise<EmployeeFeedback[]> {
    return this.feedback.find({ order: { createdAt: 'DESC' } });
  }

  async resolveFeedback(input: ResolveFeedbackData): Promise<EmployeeFeedback> {
    const organizationId = this.tenantContext.getOrganizationId();
    const feedback = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(EmployeeFeedback, {
        where: {
          id: input.employeeFeedbackId,
          organizationId,
        } as FindOptionsWhere<EmployeeFeedback>,
      });
      if (!current) {
        throw new NotFoundError('Employee feedback not found', {
          id: input.employeeFeedbackId,
        });
      }
      current.status = input.status;
      if (input.resolutionNote !== undefined) {
        current.resolutionNote = input.resolutionNote;
      }
      current.resolvedByUserId = input.status === 'resolved' ? input.resolvedByUserId : null;
      const saved = await manager.save(current);
      await this.publisher.publishWithin(manager, {
        name: 'employeeFeedback.updated',
        payload: {
          employeeFeedbackId: toId<EmployeeFeedbackId>(saved.id),
          status: saved.status,
        },
      });
      return saved;
    });

    await this.audit.record({
      action: 'update',
      resourceType: 'employee_feedback',
      resourceId: feedback.id,
      after: { status: feedback.status },
    });
    return feedback;
  }

  private visibleAnnouncementAudiences(portal: PortalKind): ReadonlySet<AnnouncementAudience> {
    if (portal === 'tethr') return new Set(['all', 'tethr', 'client', 'employee']);
    if (portal === 'client') return new Set(['all', 'client']);
    if (portal === 'employee') return new Set(['all', 'employee']);
    return new Set(['all']);
  }
}
