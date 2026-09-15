import type { IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One row per service month once a payroll run finalizes for that month: what
// was invoiced to the client (salary/catch-up lines across all groups) against
// what the month actually cost in employer terms (converted at the snapshot's
// frozen FX). Rows are written by reconciliation and never edited by hand; a
// `variance` status is the signal for finance to review before the period is
// considered closed.
@Entity('billing_period_closes')
@Index('billing_period_closes_org_period_unique', ['organizationId', 'serviceYear', 'serviceMonth'], {
  unique: true,
})
export class BillingPeriodClose extends TenantScopedEntity {
  @Column({ type: 'int' })
  serviceYear!: number;

  @Column({ type: 'int' })
  serviceMonth!: number;

  @Column({ type: 'uuid' })
  payrollRunId!: string;

  @Column({ type: 'date' })
  payDate!: IsoDate;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'int' })
  invoiceCount!: number;

  // Salary + catch-up line totals for the month, across every billing group.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  invoicedAmount!: string;

  // Converted employer cost of the covering run; null when no FX rate was set.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  payrollCostAmount!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  varianceAmount!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: 'balanced' | 'variance' | 'no_cost_data';
}
