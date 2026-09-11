import type { PayComponentCategory } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// Tenant-owned compensation component configuration: base pay, housing,
// transport, deductions, employer contributions, etc. Payroll reads this config;
// it must be data, not code.
@Entity('pay_components')
@Index(['organizationId', 'code'], { unique: true })
export class PayComponent extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: PayComponentCategory;

  @Column({ type: 'boolean', default: true })
  taxable!: boolean;

  @Column({ type: 'boolean', default: true })
  recurring!: boolean;

  // Whether payroll pro-rates this component by payable days. True for salary
  // (basic, housing); false for reimbursements/flat allowances that are paid in
  // full regardless of days worked. Mirrors Frappe's depends_on_payment_days.
  @Column({ type: 'boolean', default: true })
  dependsOnPaymentDays!: boolean;
}
