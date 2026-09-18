import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { InvoiceService } from './invoice.service';

const CONSUMER_NAME = 'billing.draft-invoices-on-payroll-finalized';
const TERMINATION_CONSUMER_NAME = 'billing.close-membership-on-termination';

// When a payroll run finalizes, draft Services invoices per billing group. The
// consumer depends on the shared event contract and the billing + payroll
// published surfaces only — no reverse dependency from payroll into billing
// (plan.md §5.2). Idempotent per event, and the drafter itself is a no-op when
// the service month is already covered.
@Injectable()
export class PayrollFinalizedBillingConsumer implements OnModuleInit {
  private readonly logger = new Logger(PayrollFinalizedBillingConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly invoiceService: InvoiceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('payroll.finalized', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'payroll.finalized') {
      return;
    }
    await this.idempotency.runOnce(CONSUMER_NAME, event, (manager) =>
      // The relay runs outside any request — re-establish the tenant first.
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const drafted = await this.invoiceService.draftInvoicesFromRun(
          event.payload.payrollRunId,
          manager,
        );
        if (drafted.length > 0) {
          this.logger.log(
            `Drafted ${drafted.length} services invoice(s) from payroll run ${event.payload.payrollRunId}`,
          );
        }
      }),
    );
  }
}

// When an employee is terminated, close their billing membership at the last
// working day so the next invoice no longer bills a departed person and the
// final month is pro-rated. Depends only on the shared event contract and the
// billing published surface — no reverse dependency from employee into billing.
@Injectable()
export class EmployeeTerminatedBillingConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeTerminatedBillingConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly invoiceService: InvoiceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('employee.terminated', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'employee.terminated') {
      return;
    }
    await this.idempotency.runOnce(TERMINATION_CONSUMER_NAME, event, (manager) =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        await this.invoiceService.closeMembershipAt(
          event.payload.employeeId,
          event.payload.effectiveDate as IsoDate,
          manager,
        );
        this.logger.log(
          `Closed billing membership for terminated employee ${event.payload.employeeId}`,
        );
      }),
    );
  }
}
