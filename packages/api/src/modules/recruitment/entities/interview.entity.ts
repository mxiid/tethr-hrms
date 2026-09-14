import type { InterviewOutcome, InterviewStatus, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One scheduled interview for an application's round. Created by Tethr, never
// self-scheduled: there is deliberately no availability picker or client invite
// flow. Rollups are computed on read (no stored average to go stale).
@Entity('interviews')
@Index(['organizationId', 'applicationId'])
export class Interview extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'uuid' })
  interviewRoundId!: string;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  status!: InterviewStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  outcome!: InterviewOutcome | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid' })
  scheduledByUserId!: UserId;
}
