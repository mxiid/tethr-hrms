import type { GradeId, PayFrequency } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// Tenant compensation package configuration. It references Grade by id only:
// no DB-level FK across module boundaries.
@Entity('salary_structures')
@Index(['organizationId', 'code'], { unique: true })
export class SalaryStructure extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'uuid', nullable: true })
  gradeId!: GradeId | null;

  // Entitlement default for the grade: pre-fills a new employee's assignment so
  // pay setup is one confirm rather than a blank form. Null = no default.
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  defaultAnnualAmount!: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: 'monthly' })
  payFrequency!: PayFrequency;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
