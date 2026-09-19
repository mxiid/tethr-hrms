import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { CompensationService } from './compensation.service';

const CONSUMER_NAME = 'compensation.close-revision-on-termination';

// When an employee is terminated, close their open salary revision after the
// last working day. Depends only on the shared event contract and this module's
// own service — no dependency on the employee module.
@Injectable()
export class EmployeeTerminatedCompensationConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeTerminatedCompensationConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly compensation: CompensationService,
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
        await this.compensation.closeOpenRevisionAt(
          event.payload.employeeId,
          event.payload.effectiveDate as IsoDate,
          manager,
        );
        this.logger.log(`Closed salary revision for terminated employee ${event.payload.employeeId}`);
      }),
    );
  }
}
