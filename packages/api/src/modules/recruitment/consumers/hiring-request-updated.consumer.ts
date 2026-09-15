import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

const CONSUMER_NAME = 'recruitment.notify-hiring-request-updated';

// A request changing state is the agency's cue: on hold, filled or cancelled all
// change what the team does next. The event has been published transactionally
// since the request lifecycle existed; this consumer gives it its first reader.
// Idempotent, and the tenant is re-established from the event because the relay
// runs outside any request.
@Injectable()
export class HiringRequestUpdatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(HiringRequestUpdatedConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationService,
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
        await this.notifications.sendSlack({
          templateKey: 'hiringRequestUpdated',
          data: { hiringRequestId, status, positionTitle },
        });
        this.logger.log(`Notified Slack that hiring request ${hiringRequestId} is ${status}`);
      }),
    );
  }
}
