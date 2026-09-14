import type { EmployeeId, IsoDate, PayComponentId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// The single choke point for every period-scoped pay adjustment (Frappe's
// Additional Salary). Bonuses, encashments, advance recoveries, arrears,
// corrections and overtime all become one of these, so payroll needs no new
// plumbing per source. Payroll reads them through the published interface and
// emits them as line components carrying `sourceType`/`sourceId` provenance.
//
// Deliberately NOT a TemporalEntity: an adjustment belongs to one pay period
// (its `periodYear`/`periodMonth`), matching Frappe's `payroll_date`, rather than
// being an effective-dated fact with an open-ended validity. The recurring mode
// carries its own half-open `[recurringFrom, recurringTo)` window for the rarer
// "every month until X" case.
export type PayAdjustmentKind =
  | 'bonus'
  | 'encashment'
  | 'advanceRecovery'
  | 'arrear'
  | 'correction'
  | 'other';

@Entity('pay_adjustments')
@Index(['organizationId', 'employeeId', 'periodYear', 'periodMonth'])
export class PayAdjustment extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'uuid' })
  componentId!: PayComponentId;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'int' })
  periodYear!: number;

  @Column({ type: 'int' })
  periodMonth!: number;

  @Column({ type: 'varchar', length: 32 })
  kind!: PayAdjustmentKind;

  // Where this came from (e.g. 'bonusAward' + the award id), so a payslip can
  // say why a line exists.
  @Column({ type: 'varchar', length: 32, nullable: true })
  sourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  // When true, replaces the structure's component of the same code rather than
  // adding to it (Frappe's overwrite_salary_structure_amount).
  @Column({ type: 'boolean', default: false })
  overwritesStructureAmount!: boolean;

  // Recurring window; null for one-off period adjustments.
  @Column({ type: 'boolean', default: false })
  isRecurring!: boolean;

  @Column({ type: 'date', nullable: true })
  recurringFrom!: IsoDate | null;

  @Column({ type: 'date', nullable: true })
  recurringTo!: IsoDate | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;
}
