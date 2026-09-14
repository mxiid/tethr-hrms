import type { DomainEvent, IsoDate } from '@hrms/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../../../core/events/event-bus.service';
import { IdempotencyService } from '../../../core/events/idempotency.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';

import { PayrollRunService } from './payroll-run.service';

const CONSUMER_NAME = 'payroll.mark-drafts-stale-on-salary-revision';

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
