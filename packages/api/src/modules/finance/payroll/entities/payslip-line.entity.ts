import type { PayComponentCategory } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One named amount on a payslip (basic, allowances, deductions). A full copy of
// the run-line component at finalization — the payslip renders from its own lines
// only.
@Entity('payslip_lines')
@Index(['organizationId', 'payslipId'])
export class PayslipLine extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  payslipId!: string;

  @Column({ type: 'varchar', length: 32 })
  componentCode!: string;

  @Column({ type: 'varchar', length: 64 })
  componentName!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: PayComponentCategory;

  @Column({ type: 'boolean' })
  taxable!: boolean;

  @Column({ type: 'boolean', default: true })
  dependsOnPaymentDays!: boolean;

  // True when a deduction reduces the taxable base (a pre-tax benefit share).
  @Column({ type: 'boolean', default: false })
  preTax!: boolean;

  // Frozen pair: what the component would have paid for a full period, and what
  // it actually paid after pro-rating. Null defaultAmount only on legacy rows.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  defaultAmount!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'int' })
  sortOrder!: number;
}
