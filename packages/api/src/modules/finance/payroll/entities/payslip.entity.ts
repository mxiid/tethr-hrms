import type { EmployeeId, IsoDate, PayrollRunId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// What finalization applied when it computed this payslip's withholding: the
// resolved profile facts and which source won (`lineOverride` beats a fixed
// amount, which beats the profile, which beats the plain tenant ladder).
export type TaxProfileSnapshot = {
  readonly source: 'lineOverride' | 'fixed' | 'profile' | 'computed';
  readonly profileId: string | null;
  readonly filerStatus: string | null;
  readonly monthlyExemptionAmount: number;
  readonly annualTaxCreditAmount: number;
  readonly priorAnnualIncome: number;
  readonly fixedMonthlyWithholding: number | null;
};

// The immutable record of what an employee was paid for a period. Created only at
// finalization; every displayed fact is a snapshot (identity, amounts, days) so a
// later rename or salary change can never rewrite history (non-negotiable #3).
// Payslip numbers are per-organization sequential and human-readable.
@Entity('payslips')
@Index(['organizationId', 'runId'])
@Index(['organizationId', 'employeeId', 'periodYear', 'periodMonth'], { unique: true })
@Index('payslips_org_number_unique', ['organizationId', 'payslipNumber'], { unique: true })
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

  // Denominator for the paid-day fraction ("18 of 22 days"); the employee's own
  // working-day count for the period.
  @Column({ type: 'int', default: 0 })
  standardWorkingDays!: number;

  // --- Money snapshot (numeric-as-string) ---
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  grossAmount!: string;

  // Employee-side deductions (excluding income tax, which has its own column).
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  deductionsAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  taxableAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  incomeTaxAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  netPayAmount!: string;

  // Employer-side contributions and the total cost of this employee for the
  // period (gross + employer contributions). Never part of net pay.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employerContributionAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employerCostAmount!: string;

  // The withholding trail: which tax facts were applied (profile, fixed amount,
  // or a finance override). Null on payslips finalized before profiles existed.
  @Column({ type: 'jsonb', nullable: true, default: null })
  taxProfileSnapshot!: TaxProfileSnapshot | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;
}
