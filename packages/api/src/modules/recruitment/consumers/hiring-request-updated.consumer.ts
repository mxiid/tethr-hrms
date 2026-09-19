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
    this.eventBus.register('hiringRequest.updated', CONSUMER_NAME, (event) =>
      this.handle(event),
    );
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'hiringRequest.updated') {
      return;
    }
    const { hiringRequestId, status, positionTitle } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        // Positions live in the request's workspace, so reconcile under the
        // event's tenant — for every status change, a resume included: the
        // sync attempt in the request call may have failed, and this is the
        // durable retry that repairs it. The returned request is the freshest
        // state, which every decision below follows instead of the event's
        // status: a retried stale event must not undo a newer transition.
        const current = await this.recruitment.reconcilePositionForRequest(
          hiringRequestId,
          manager,
        );
        if (current && UNPUBLISH_STATUSES.includes(current.status)) {
          // Postings live in the operator's workspace: step over there as the
          // system principal (the unpublish writes its own audit records), no
          // user session exists for this consumer.
          const tethrOrganizationId = await this.platformScope.resolveTethrOrganizationId();
          await this.tenantContext.run(
            { organizationId: tethrOrganizationId, userId: null },
            () => this.recruitment.unpublishPostingsForRequest(hiringRequestId, manager),
          );
        }
        // Slack is an external side effect: it cannot join the transaction and
        // is therefore at-least-once (a retried event may notify twice).
        if (current?.status === status) {
          await this.notifications.sendSlack({
            templateKey: 'hiringRequestUpdated',
            data: { hiringRequestId, status, positionTitle },
          });
        } else {
          // A superseded event: announcing its old status would be wrong, and
          // the newer status has (or had) its own event.
          this.logger.log(
            `Superseded ${status} event for hiring request ${hiringRequestId}${
              current ? ` (now ${current.status})` : ' (request missing)'
            }; notice skipped`,
          );
        }
        this.logger.log(`Reconciled hiring request ${hiringRequestId} after a ${status} event`);
      }),
    );
  }
}
