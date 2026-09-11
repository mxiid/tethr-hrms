import { Module } from '@nestjs/common';

import { BillingModule } from './billing/billing.module';
import { CompensationModule } from './compensation/compensation.module';
import { PayrollModule } from './payroll/payroll.module';

// Finance groups the money-movement domain modules behind one top-level module
// identity — matching the "Finance" nav group and the tethrFinance role.
// Compensation (what the nav labels "Pay"), Payroll, and Billing stay separate,
// self-contained modules; this wrapper only composes them, and is where future
// Finance-adjacent modules (plan.md §4.5, e.g. Loans & Advances) plug in later.
@Module({
  imports: [CompensationModule, PayrollModule, BillingModule],
  exports: [CompensationModule, PayrollModule, BillingModule],
})
export class FinanceModule {}
