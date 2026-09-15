import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PlatformScopeService } from '../../../core/tenancy/platform-scope.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { RecruitmentService } from '../recruitment.service';

const CONSUMER_NAME = 'recruitment.notify-hiring-request-updated';
// Held and terminal requests must not keep sourcing: their posting comes down.
// Every status change reconciles the linked position, including a resume from
// onHold, because the synchronous attempt may have failed.
const UNPUBLISH_STATUSES = ['onHold', 'filled', 'cancelled'];

// A request changing state is the agency's cue: on hold, filled or cancelled all
// change what the team does next. The event is transactional with the request
// update, so this consumer is also the durable cleanup path: the synchronous
// attempt in the request call is best-effort, while the outbox retries this
// handler (idempotently, with its own ledger row) until the position is
// reconciled and the operator-owned posting is off the air. The tenant is
// re-established from the event because the relay runs outside any request.
@Injectable()
export class HiringRequestUpdatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(HiringRequestUpdatedConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationService,
    private readonly platformScope: PlatformScopeService,
    private readonly recruitment: RecruitmentService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('hiringRequest.updated', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'hiringRequest.updated') {
      return;
    }
    const { hiringRequestId, status, positionTitle } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        // Positions live in the request's workspace, so reconcile under the
        // event's tenant — for every status change, a resume included: the
        // sync attempt in the request call may have failed, and this is the
        // durable retry that repairs it.
        await this.recruitment.reconcilePositionForRequest(hiringRequestId);
        if (UNPUBLISH_STATUSES.includes(status)) {
          // Postings live in the operator's workspace: step over there as the
          // system principal (the unpublish writes its own audit records), no
          // user session exists for this consumer.
          const tethrOrganizationId = await this.platformScope.resolveTethrOrganizationId();
          await this.tenantContext.run(
            { organizationId: tethrOrganizationId, userId: null },
            () => this.recruitment.unpublishPostingsForRequest(hiringRequestId),
          );
        }
        await this.notifications.sendSlack({
          templateKey: 'hiringRequestUpdated',
          data: { hiringRequestId, status, positionTitle },
        });
        this.logger.log(`Handled hiring request ${hiringRequestId} update to ${status}`);
      }),
    );
  }
}
