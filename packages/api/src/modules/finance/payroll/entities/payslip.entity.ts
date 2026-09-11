import type { EmployeeId, IsoDate, PayrollRunId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// The immutable record of what an employee was paid for a period. Created only at
// finalization; every displayed fact is a snapshot (identity, amounts, days) so a
// later rename or salary change can never rewrite history (non-negotiable #3).
// Payslip numbers are per-organization sequential and human-readable.
@Entity('payslips')
@Index(['organizationId', 'runId'])
@Index(['organizationId', 'employeeId', 'periodYear', 'periodMonth'], { unique: true })
export class Payslip extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  runId!: PayrollRunId;

  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'varchar', length: 32 })
  payslipNumber!: string;

  @Column({ type: 'int' })
  periodYear!: number;

  @Column({ type: 'int' })
  periodMonth!: number;

  @Column({ type: 'date' })
  payDate!: IsoDate;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // --- Identity snapshot (never re-read from the employee module to render) ---
  @Column({ type: 'varchar', length: 32 })
  employeeNumber!: string;

  @Column({ type: 'varchar', length: 257 })
  employeeName!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  roleTitle!: string | null;

  @Column({ type: 'date' })
  hireDate!: IsoDate;

  // --- Period facts ---
  @Column({ type: 'numeric', precision: 7, scale: 2 })
  paidDays!: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: '0' })
  lopDays!: string;

  // --- Money snapshot (numeric-as-string) ---
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  grossAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  taxableAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  incomeTaxAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  netPayAmount!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;
}
