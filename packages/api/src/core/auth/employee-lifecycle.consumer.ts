import type { DomainEvent } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../events/event-bus.service';
import { IdempotencyService } from '../events/idempotency.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { AuthService } from './auth.service';


const CONSUMER_NAME = 'auth.disable-login-on-termination';

// When an employee is terminated, disable their login. The consumer depends only
// on the shared event contract — NOT on the employee module (plan.md §5.2). This
// is how core/ reacts to a domain event without a code dependency on modules/,
// keeping the two-bucket rule intact and the modules independently extractable.
@Injectable()
export class EmployeeLifecycleConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeLifecycleConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly authService: AuthService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('employee.terminated', CONSUMER_NAME, (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'employee.terminated') {
      return;
    }
    const { employeeId } = event.payload;
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      // The relay runs outside any request, so establish the tenant from the
      // event before touching tenant-scoped data.
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const disabled = await this.authService.disableUsersForEmployee(employeeId, manager);
        this.logger.log(`Disabled ${disabled} login(s) for a terminated employee`);
      }),
    );
  }
}
