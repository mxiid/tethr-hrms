import type { DepartmentId, GradeId, JobId, LocationId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';


type PositionStatus = 'open' | 'filled' | 'frozen' | 'closed';

// A concrete seat. References its job, department, location, and grade by ID
// (department and location live in the organization module — ID refs, no FK).
@Entity('positions')
@Index(['organizationId', 'status'])
export class Position extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'uuid' })
  jobId!: JobId;

  @Column({ type: 'uuid', nullable: true })
  departmentId!: DepartmentId | null;

  @Column({ type: 'uuid', nullable: true })
  locationId!: LocationId | null;

  @Column({ type: 'uuid', nullable: true })
  gradeId!: GradeId | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: PositionStatus;

  @Column({ type: 'int', default: 1 })
  headcount!: number;
}
