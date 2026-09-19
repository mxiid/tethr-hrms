import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { CompensationService } from './compensation.service';

const CONSUMER_NAME = 'compensation.record-hire-salary-on-offer-accepted';

// The offer's salary reaches compensation through the outbox instead of a
// synchronous cross-module call: the event is written in the hire transaction
// (under the client workspace, where the employee lives), and this consumer
// records the first revision idempotently. A workspace with no matching salary
// structure records nothing — payroll readiness flags that gap.
@Injectable()
export class OfferAcceptedCompensationConsumer implements OnModuleInit {
  private readonly logger = new Logger(OfferAcceptedCompensationConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly compensation: CompensationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('offer.accepted', CONSUMER_NAME, (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'offer.accepted') {
      return;
    }
    const { employeeId, annualAmount, currency, effectiveDate, acceptedByUserId } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const revision = await this.compensation.recordHireSalary(
          {
            employeeId,
            annualAmount,
            currency,
            effectiveDate,
            approvedByUserId: acceptedByUserId,
          },
          manager,
        );
        this.logger.log(
          revision
            ? `Recorded hire revision ${revision.id} for employee ${employeeId}`
            : `No matching salary structure for employee ${employeeId}; revision skipped`,
        );
      }),
    );
  }
}
