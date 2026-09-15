import type { EmployeeId, TaxFilerStatus } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TemporalEntity } from '../../../../core/database/entities/temporal.entity';

// An employee's effective-dated withholding facts (non-negotiable #4): the
// tenant slab ladder stays the default, and this profile layers the employee's
// own exemptions, resolved credits, prior-employer income and any fixed
// withholding on top. Payroll resolves it as of the run's period through the
// compensation published interface; the payslip snapshots what was applied.
//
// Amounts are plain PKR facts; `fixedMonthlyWithholding` is an explicit finance
// instruction that overrides the ladder entirely.
@Entity('employee_tax_profiles')
@Index(['organizationId', 'employeeId'])
@Index('employee_tax_profiles_open_unique', ['organizationId', 'employeeId'], {
  unique: true,
  where: '"validTo" IS NULL',
})
export class EmployeeTaxProfile extends TemporalEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'varchar', length: 16, default: 'filer' })
  filerStatus!: TaxFilerStatus;

  // Recurring exempt amounts excluded from the monthly taxable base.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  monthlyExemptionAmount!: string;

  // Annual credit amount already resolved by finance (e.g. a percentage of an
  // eligible investment); payroll subtracts it from the annual liability.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  annualTaxCreditAmount!: string;

  // Salary already earned from a previous employer in the same tax year.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  priorAnnualIncome!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  fixedMonthlyWithholding!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;
}
