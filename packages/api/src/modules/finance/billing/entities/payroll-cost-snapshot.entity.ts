import type { IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One row per finalized payroll run: the run's snapshotted cost facts converted
// to the client's billing currency at the rate prevailing on the pay date. The
// rate is frozen here so the reconciliation never re-derives a value from a
// later FX edit. `convertedEmployerCost` is null when no rate was configured;
// the snapshot is still recorded so the variance report can flag the gap.
@Entity('payroll_cost_snapshots')
@Index('payroll_cost_snapshots_org_run_unique', ['organizationId', 'payrollRunId'], {
  unique: true,
})
export class PayrollCostSnapshot extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  payrollRunId!: string;

  @Column({ type: 'int' })
  periodYear!: number;

  @Column({ type: 'int' })
  periodMonth!: number;

  @Column({ type: 'date' })
  payDate!: IsoDate;

  @Column({ type: 'varchar', length: 3 })
  payrollCurrency!: string;

  @Column({ type: 'varchar', length: 3 })
  billingCurrency!: string;

  // Units of billingCurrency per 1 payrollCurrency as of payDate. Null when no
  // rate could be resolved.
  @Column({ type: 'numeric', precision: 18, scale: 8, nullable: true })
  fxRate!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  grossTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  employerCostTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  convertedEmployerCost!: string | null;

  // Per-employee cost facts in the payroll currency, frozen alongside the
  // totals so line-level reconciliation never re-reads payroll tables:
  // [{ employeeId, grossAmount, employerCostAmount }].
  @Column({ type: 'jsonb', default: () => "'[]'" })
  employeeCosts!: { employeeId: string; grossAmount: number; employerCostAmount: number }[];
}
