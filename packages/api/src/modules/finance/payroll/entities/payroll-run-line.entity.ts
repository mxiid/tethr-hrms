import type { EmployeeId, PayrollRunId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One employee's inputs for a run. Derived totals (taxable, tax, net) are never
// stored here — they are computed from these inputs plus the component lines by
// one pure function, so draft edits stay consistent and finalize snapshots
// exactly what was reviewed. Money is numeric-as-string.
@Entity('payroll_run_lines')
@Index(['organizationId', 'runId'])
@Index(['organizationId', 'runId', 'employeeId'], { unique: true })
export class PayrollRunLine extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  runId!: PayrollRunId;

  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  payableDays!: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: '0' })
  lopDays!: string;

  // The denominator this line's pro-rata used: the employee's own working days in
  // the period (their holiday calendar when set, else the run's). Stored per line
  // so a day-count edit recomputes against the right base, and so the payslip can
  // explain "8 of 22 days" later.
  @Column({ type: 'int', default: 0 })
  standardWorkingDays!: number;

  // Gross actually payable for the period: the sum of the pro-rated earnings,
  // snapshotted from the effective salary revision + structure composition. NOT
  // the raw annualAmount/12 — a mid-month joiner or an unpaid-leave month pays
  // less than a full month.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  grossAmount!: string;

  // Finance override for the computed withholding; null = use the engine.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  taxOverrideAmount!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;
}
