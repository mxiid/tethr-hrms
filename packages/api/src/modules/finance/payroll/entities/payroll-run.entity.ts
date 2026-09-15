import type { HolidayCalendarId, IsoDate, PayrollRunStatus, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// A monthly payroll run for one client workspace. One run per period — a draft
// that can be regenerated freely until finalized; finalization snapshots payslips
// and locks everything. The holiday calendar is an ID reference into the leave
// module (no cross-module FK) so weekend/holiday math matches leave costing.
@Entity('payroll_runs')
@Index(['organizationId', 'periodYear', 'periodMonth'], { unique: true })
export class PayrollRun extends TenantScopedEntity {
  @Column({ type: 'int' })
  periodYear!: number;

  @Column({ type: 'int' })
  periodMonth!: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: PayrollRunStatus;

  // Internal payroll currency. V1 runs in PKR end to end.
  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency!: string;

  // Working days in the period after weekends and configured holidays — the
  // ceiling every employee's payable days are clamped to.
  @Column({ type: 'int' })
  standardWorkingDays!: number;

  @Column({ type: 'uuid', nullable: true })
  holidayCalendarId!: HolidayCalendarId | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  // The date the bank was told to pay (from finalize input, defaults to the day
  // of finalization). Snapshotted onto payslips and the cost snapshot.
  @Column({ type: 'date', nullable: true })
  payDate!: IsoDate | null;

  @Column({ type: 'uuid', nullable: true })
  finalizedByUserId!: UserId | null;

  // When finalization proceeded despite hard readiness blockers (e.g. a line with
  // no earning components), the reason finance gave. Null = clean finalize.
  @Column({ type: 'varchar', length: 500, nullable: true })
  finalizeOverrideReason!: string | null;

  // Which guards the override covered (e.g. ["unconfigured","zeroedWithDays"]),
  // so a zeroed-earnings month keeps its justification on the record.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  finalizeOverrideGuards!: string[];

  // --- Money totals, snapshotted at finalization (numeric-as-string) ---
  // Gross payable to employees, employee-side deductions, take-home pay, and
  // employer-side contributions/cost on top of gross. Zero until finalized.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  grossTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  deductionsTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  netTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employerContributionTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employerCostTotal!: string;

  // Disbursement state, mirroring invoices: set once the bank actually paid out.
  @Column({ type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentReference!: string | null;

  // Set by the `compensation.revised` consumer when a raise lands inside this
  // draft run's period, so finance knows to regenerate before finalizing.
  @Column({ type: 'boolean', default: false })
  isStale!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  staleReason!: string | null;
}
