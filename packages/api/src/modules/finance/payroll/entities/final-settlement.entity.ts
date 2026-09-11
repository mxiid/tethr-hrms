import type { EmployeeId, IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// The money side of a termination: the pro-rated final partial month, leave
// encashment priced from the leave balance, and any recoveries — with a payable
// total. Replaces the old `finalSettlement` checkbox with real figures. Computed
// and stored when the employee is terminated.
type FinalSettlementStatus = 'computed' | 'paid';

@Entity('final_settlements')
@Index(['organizationId', 'employeeId'])
export class FinalSettlement extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'date' })
  terminationDate!: IsoDate;

  @Column({ type: 'int' })
  periodYear!: number;

  @Column({ type: 'int' })
  periodMonth!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'int' })
  standardWorkingDays!: number;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  workedDays!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  proRatedEarnings!: string;

  // Earnings from PayAdjustments falling in the final period (bonus, arrear,
  // encashment, …) — a normal run pays these, so the settlement must too.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  adjustmentEarnings!: string;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  leaveBalanceDays!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  leaveEncashmentAmount!: string;

  // All deductions: advance recoveries plus any deduction-category adjustments.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  recoveryAmount!: string;

  // Gross payable before withholding.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  payableTotal!: string;

  // Withholding applied the same way a normal payslip does.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  taxableAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  incomeTaxAmount!: string;

  // What the leaver actually receives: payableTotal − incomeTax.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  netPayableAmount!: string;

  @Column({ type: 'varchar', length: 16, default: 'computed' })
  status!: FinalSettlementStatus;

  @Column({ type: 'timestamptz' })
  computedAt!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;
}
