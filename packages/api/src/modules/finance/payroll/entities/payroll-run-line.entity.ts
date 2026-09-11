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

  // Monthly gross snapshotted from the effective salary revision at draft time.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  grossAmount!: string;

  // Finance override for the computed withholding; null = use the engine.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  taxOverrideAmount!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;
}
