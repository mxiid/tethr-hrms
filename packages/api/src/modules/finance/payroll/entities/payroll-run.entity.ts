import type { HolidayCalendarId, PayrollRunStatus, UserId } from '@hrms/shared';
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

  @Column({ type: 'uuid', nullable: true })
  finalizedByUserId!: UserId | null;

  // When finalization proceeded despite hard readiness blockers (e.g. a line with
  // no earning components), the reason finance gave. Null = clean finalize.
  @Column({ type: 'varchar', length: 500, nullable: true })
  finalizeOverrideReason!: string | null;

  // Set by the `compensation.revised` consumer when a raise lands inside this
  // draft run's period, so finance knows to regenerate before finalizing.
  @Column({ type: 'boolean', default: false })
  isStale!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  staleReason!: string | null;
}
