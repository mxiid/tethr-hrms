import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { FinalSettlementService } from './final-settlement.service';

const CONSUMER_NAME = 'payroll.compute-final-settlement-on-termination';

// When an employee is terminated, compute and store their full-and-final
// settlement (pro-rated final month + leave encashment + recoveries). Depends
// only on the shared event contract and this module's own service.
@Injectable()
export class EmployeeTerminatedFinalSettlementConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeTerminatedFinalSettlementConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly finalSettlements: FinalSettlementService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('employee.terminated', CONSUMER_NAME, (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'employee.terminated') {
      return;
    }
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        try {
          const settlement = await this.finalSettlements.compute(
            event.payload.employeeId,
            event.payload.effectiveDate as IsoDate,
            manager,
          );
          this.logger.log(
            `Computed final settlement for ${event.payload.employeeId}: ${settlement.payableTotal} ${settlement.currency}`,
          );
        } catch (cause) {
          this.logger.warn(
            `Could not compute final settlement for ${event.payload.employeeId}: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
          // Rethrow so the idempotency transaction rolls back and the outbox
          // retries the event (MAX_ATTEMPTS = 5); swallowing here would mark a
          // failed settlement processed forever.
          throw cause;
        }
      }),
    );
  }
}
