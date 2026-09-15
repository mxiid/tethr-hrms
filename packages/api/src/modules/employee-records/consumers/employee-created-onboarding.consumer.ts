import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { EmployeeRecordsService } from '../employee-records.service';

const CONSUMER_NAME = 'employee-records.seed-onboarding-on-hire';

// Hires should not depend on an operator remembering to open the checklist: the
// employee.created event (published transactionally by EmployeeService.create)
// seeds the seven standard tasks for every new joiner. Idempotent, and the
// tenant is re-established from the event because the relay runs outside any
// request.
@Injectable()
export class EmployeeCreatedOnboardingConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeCreatedOnboardingConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly records: EmployeeRecordsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('employee.created', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'employee.created') {
      return;
    }
    const { employeeId } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const created = await this.records.seedOnboardingChecklist(employeeId);
        this.logger.log(`Seeded ${created} onboarding task(s) for employee ${employeeId}`);
      }),
    );
  }
}
