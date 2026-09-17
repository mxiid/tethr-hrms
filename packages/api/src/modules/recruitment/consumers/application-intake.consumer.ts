import type { DomainEvent } from '@hrms/shared';
import { toId, type CandidateId } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { AtsService } from '../ats.service';

const CONSUMER_NAME = 'recruitment.application-intake';

// Turns an application-form submission into a Candidate + Application (+ CV
// document and parse job), then acknowledges the candidate by email. The event
// is the only coupling to the forms module, and the tenant comes from the event
// because the relay runs outside a request.
@Injectable()
export class ApplicationIntakeConsumer implements OnModuleInit {
  private readonly logger = new Logger(ApplicationIntakeConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
    private readonly ats: AtsService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('form.submitted', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'form.submitted' || event.payload.target !== 'application') {
      return;
    }
    const { submissionId } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const application = await this.ats.applyFormSubmission(submissionId, manager);
        if (!application) return;
        this.logger.log(`Application ${application.id} created from submission ${submissionId}`);

        const candidate = await this.ats.getCandidate(
          toId<CandidateId>(application.candidateId),
        );
        const postings = await this.ats.postingsByIds([application.jobPostingId]);
        // Email is an external side effect: it cannot join the transaction and
        // is therefore at-least-once, so it stays last.
        await this.notifications.send({
          channel: 'email',
          to: candidate.email,
          templateKey: 'applicationReceived',
          data: {
            candidateName: candidate.fullName,
            positionTitle: postings.get(application.jobPostingId)?.title ?? 'the role',
          },
        });
      }),
    );
    // After the ledger transaction commits, enqueue parse jobs for the CvParse
    // rows the projection left pending: Redis never runs inside the transaction,
    // and the jobId makes this idempotent.
    await this.tenantContext.run(
      { organizationId: event.tenantId, userId: null },
      () => this.ats.reconcilePendingCvParses(),
    );
  }
}