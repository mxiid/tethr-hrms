import type { BonusReason, EmployeeId, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

@Entity('bonus_awards')
@Index(['organizationId', 'employeeId', 'awardDate'])
export class BonusAward extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'date' })
  awardDate!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 32 })
  reason!: BonusReason;

  @Column({ type: 'uuid' })
  awardedByUserId!: UserId;

  @Column({ type: 'uuid', nullable: true })
  approvedByUserId!: UserId | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;
}
