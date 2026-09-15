import type { PayComponentCategory } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// The component breakdown of one run line, snapshotted when the line was drafted
// so finalize always reproduces exactly what finance reviewed — even if the
// structure composition or component config changes in between. Component facts
// (code, name, category, taxable) are copies by design: this is the boundary
// where live compensation config becomes run history.
@Entity('payroll_run_line_components')
@Index(['organizationId', 'lineId'])
export class PayrollRunLineComponent extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  lineId!: string;

  @Column({ type: 'varchar', length: 32 })
  componentCode!: string;

  @Column({ type: 'varchar', length: 64 })
  componentName!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: PayComponentCategory;

  @Column({ type: 'boolean' })
  taxable!: boolean;

  // Whether this component's amount scales with payable days (Frappe's
  // depends_on_payment_days). Stored so Phase 4 can explain why a line shrank.
  @Column({ type: 'boolean', default: true })
  dependsOnPaymentDays!: boolean;

  // True when a deduction reduces the taxable base (a pre-tax benefit share).
  @Column({ type: 'boolean', default: false })
  preTax!: boolean;

  // The un-prorated component amount for a full period. Null only on rows
  // written before pro-rating existed; readers fall back to `amount`.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  defaultAmount!: string | null;

  // The amount actually payable this period (defaultAmount pro-rated by
  // payableDays/standardWorkingDays for day-dependent components). Equal to
  // defaultAmount when the month is full or the component is day-independent.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  // Provenance for adjustment-derived lines (e.g. 'bonusAward' + id); null for
  // structure lines. Lets a payslip explain why a line exists.
  @Column({ type: 'varchar', length: 32, nullable: true })
  sourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'int' })
  sortOrder!: number;
}
