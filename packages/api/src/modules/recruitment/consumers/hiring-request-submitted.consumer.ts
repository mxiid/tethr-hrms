import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

const CONSUMER_NAME = 'recruitment.notify-hiring-request-submitted';

// Client raises a hiring request → Slack tells the Tethr team (the Slack-as-
// notifier half of the intake decision). The event is transactional; this
// consumer is idempotent, and re-establishes the tenant from the event because
// the relay runs outside any request.
@Injectable()
export class HiringRequestSubmittedConsumer implements OnModuleInit {
  private readonly logger = new Logger(HiringRequestSubmittedConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('hiringRequest.submitted', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'hiringRequest.submitted') {
      return;
    }
    const { hiringRequestId, positionTitle } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        await this.notifications.sendSlack({
          templateKey: 'hiringRequestSubmitted',
          data: { hiringRequestId, positionTitle },
        });
        this.logger.log(`Notified Slack about hiring request ${hiringRequestId}`);
      }),
    );
  }
}
