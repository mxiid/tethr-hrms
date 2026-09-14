import type { CompensationChangeReason, EmployeeId, SalaryStructureId, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TemporalEntity } from '../../../../core/database/entities/temporal.entity';

// Effective-dated employee compensation. Historical pay records are never
// overwritten; a new revision closes the prior open-ended row and creates the
// next row. Employee and salary structure are ID references only.
@Entity('salary_revisions')
@Index(['organizationId', 'employeeId', 'validFrom'])
export class SalaryRevision extends TemporalEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'uuid' })
  salaryStructureId!: SalaryStructureId;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // numeric-as-string to avoid money drift.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  annualAmount!: string;

  @Column({ type: 'varchar', length: 32 })
  reason!: CompensationChangeReason;

  @Column({ type: 'uuid', nullable: true })
  approvedByUserId!: UserId | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;
}
