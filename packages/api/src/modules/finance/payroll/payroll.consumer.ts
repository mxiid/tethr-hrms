import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { PayrollRunService } from './payroll-run.service';

const CONSUMER_NAME = 'payroll.mark-drafts-stale-on-salary-revision';
const TAX_PROFILE_CONSUMER_NAME = 'payroll.mark-drafts-stale-on-tax-profile-change';
const BENEFITS_CONSUMER_NAME = 'payroll.mark-drafts-stale-on-benefits-change';

// A salary change that lands inside (or before) an existing draft run means the
// draft's snapshotted amounts are out of date. Flag it so finance regenerates
// before finalizing. Depends only on the shared event contract and this module's
// own service.
@Injectable()
export class SalaryRevisedPayrollConsumer implements OnModuleInit {
  private readonly logger = new Logger(SalaryRevisedPayrollConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly payrollRuns: PayrollRunService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('compensation.revised', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'compensation.revised') {
      return;
    }
    await this.idempotency.runOnce(CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const marked = await this.payrollRuns.markDraftsStaleForSalaryRevision(
          event.payload.effectiveDate as IsoDate,
        );
        if (marked > 0) {
          this.logger.log(`Marked ${marked} draft payroll run(s) stale after a salary revision`);
        }
      }),
    );
  }
}

// A tax-profile change inside (or before) a draft run's period invalidates the
// withholding already computed on the draft, so the same stale flag applies.
@Injectable()
export class TaxProfileChangedPayrollConsumer implements OnModuleInit {
  private readonly logger = new Logger(TaxProfileChangedPayrollConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly payrollRuns: PayrollRunService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('compensation.taxProfileChanged', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'compensation.taxProfileChanged') {
      return;
    }
    await this.idempotency.runOnce(TAX_PROFILE_CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const marked = await this.payrollRuns.markDraftsStaleForTaxProfile(
          event.payload.effectiveDate as IsoDate,
        );
        if (marked > 0) {
          this.logger.log(`Marked ${marked} draft payroll run(s) stale after a tax profile change`);
        }
      }),
    );
  }
}

// Enrollment changes invalidate the benefit lines on open drafts, the same
// stale-flag contract as raises and tax facts. (Plan edits don't: enrollments
// carry snapshots of what they were sold.)
@Injectable()
export class BenefitsChangedPayrollConsumer implements OnModuleInit {
  private readonly logger = new Logger(BenefitsChangedPayrollConsumer.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotency: IdempotencyService,
    private readonly payrollRuns: PayrollRunService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    this.eventBus.register('benefits.enrollmentChanged', (event) => this.handle(event));
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'benefits.enrollmentChanged') {
      return;
    }
    await this.idempotency.runOnce(BENEFITS_CONSUMER_NAME, event, () =>
      this.tenantContext.run({ organizationId: event.tenantId, userId: null }, async () => {
        const marked = await this.payrollRuns.markDraftsStaleForBenefitsChange(
          event.payload.effectiveDate as IsoDate,
        );
        if (marked > 0) {
          this.logger.log(`Marked ${marked} draft payroll run(s) stale after a benefits change`);
        }
      }),
    );
  }
}
