import type { EmployeeId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TemporalEntity } from '../../../core/database/entities/temporal.entity';

// An effective-dated enrollment (non-negotiable #4): joining a plan opens an
// interval, changing plans closes it and opens another, and payroll bills
// whatever plan covers the period. One open interval per employee and plan.
@Entity('benefit_enrollments')
@Index(['organizationId', 'employeeId'])
@Index('benefit_enrollments_open_unique', ['organizationId', 'employeeId', 'planId'], {
  unique: true,
  where: '"validTo" IS NULL',
})
export class BenefitEnrollment extends TemporalEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'uuid' })
  planId!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  // Snapshot of the plan's facts at enrollment time: plan edits are templates
  // for future enrollments, and an existing enrollment keeps what it was sold
  // (regenerating a historical draft must never restate older amounts). Null on
  // rows written before snapshots existed; readers fall back to the live plan.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  employeeContributionAmount!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  employerContributionAmount!: string | null;

  @Column({ type: 'boolean', nullable: true })
  reducesTaxable!: boolean | null;
}
