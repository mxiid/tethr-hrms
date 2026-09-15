import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../core/events/event-bus.service';
import { IdempotencyService } from '../../core/events/idempotency.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';

import { BenefitService } from './benefit.service';

const CONSUMER_NAME = 'benefits.close-enrollments-on-termination';

// A leaver's enrollments end with them: close every open interval at the last
// covered day so no future run bills benefits for someone who has left.
@Injectable()
export class EmployeeTerminatedBenefitsConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeTerminatedBenefitsConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly benefits: BenefitService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('employee.terminated', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'employee.terminated') {
      return;
    }
    await this.idempotency.runOnce(CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        await this.benefits.closeOpenEnrollmentsAt(
          event.payload.employeeId,
          event.payload.effectiveDate as IsoDate,
        );
        this.logger.log(`Closed open benefit enrollments for ${event.payload.employeeId}`);
      }),
    );
  }
}
