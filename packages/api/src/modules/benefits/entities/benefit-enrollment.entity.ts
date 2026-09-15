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
}
