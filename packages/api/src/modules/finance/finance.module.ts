import { Module } from '@nestjs/common';

import { BillingModule } from './billing/billing.module';
import { CompensationModule } from './compensation/compensation.module';
import { FxModule } from './fx/fx.module';
import { PayrollModule } from './payroll/payroll.module';

// Finance groups the money-movement domain modules behind one top-level module
// identity — matching the "Finance" nav group and the tethrFinance role.
// Compensation (what the nav labels "Pay"), Payroll, and Billing stay separate,
// self-contained modules; this wrapper only composes them. Shared FX lives here:
// it is the first cross-sibling concern (comparing PKR cost to USD billing).
@Module({
  imports: [FxModule, CompensationModule, PayrollModule, BillingModule],
  exports: [FxModule, CompensationModule, PayrollModule, BillingModule],
})
export class FinanceModule {}
