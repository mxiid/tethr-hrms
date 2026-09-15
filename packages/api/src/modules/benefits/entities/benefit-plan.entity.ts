import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A configurable benefit offering: what the employee pays per month and what
// the employer contributes on top. `reducesTaxable` marks a pre-tax employee
// share (it comes off the taxable base before withholding); employer amounts
// always flow into the employer-cost totals, never into net pay.
@Entity('benefit_plans')
@Index('benefit_plans_org_code_unique', ['organizationId', 'code'], { unique: true })
export class BenefitPlan extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employeeContributionAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  employerContributionAmount!: string;

  // When true the employee share is deducted from the taxable base before
  // withholding is computed.
  @Column({ type: 'boolean', default: false })
  reducesTaxable!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
