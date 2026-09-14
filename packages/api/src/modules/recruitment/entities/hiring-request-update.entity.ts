import type { HiringRequestId, HiringRequestStatus, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

export type HiringRequestUpdateActor = 'client' | 'tethr';

@Entity('hiring_request_updates')
@Index(['organizationId', 'hiringRequestId'])
export class HiringRequestUpdate extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  hiringRequestId!: HiringRequestId;

  @Column({ type: 'varchar', length: 24 })
  status!: HiringRequestStatus;

  @Column({ type: 'varchar', length: 16 })
  actor!: HiringRequestUpdateActor;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'uuid' })
  createdByUserId!: UserId;
}
