import type { UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One record per interviewer — not rows in a shared table. That separation is
// what gives independent submit timing, "who has not filed yet" chasing, and an
// audit trail on revision. Withdrawing (rather than editing) keeps the trail;
// the partial unique index lets a withdrawn scorecard be refiled.
//
// `panelMemberId` is whose opinion it is; `recordedByUserId` is who typed it —
// Tethr records outcomes on the client's behalf, and collapsing those two would
// lose the attribution that makes a scorecard worth anything.
@Entity('interview_feedback')
@Index(['organizationId', 'interviewId', 'panelMemberId'], {
  unique: true,
  where: '"withdrawnAt" IS NULL',
})
export class InterviewFeedback extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  interviewId!: string;

  @Column({ type: 'uuid' })
  panelMemberId!: string;

  @Column({ type: 'uuid' })
  recordedByUserId!: UserId;

  @Column({ type: 'text', nullable: true })
  overallNote!: string | null;

  @Column({ type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;
}
