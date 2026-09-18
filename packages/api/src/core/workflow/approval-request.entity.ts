import type { ApprovalStatus, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../database/entities/tenant-scoped.entity';


// One approval request handled by the shared engine. The subject (what is being
// approved) is referenced by type + id only — no cross-module FK, so leave,
// expenses, etc. can route through the same engine without coupling to it.
@Entity('approval_requests')
@Index(['organizationId', 'status'])
export class ApprovalRequest extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 64 })
  subjectType!: string;

  @Column({ type: 'uuid' })
  subjectId!: string;

  @Column({ type: 'uuid' })
  requestedByUserId!: UserId;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ApprovalStatus;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId!: UserId | null;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  decidedAt!: Date | null;
}
