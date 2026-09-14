import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A skill score on one scorecard. The skill list is copied (read-only) from the
// round template at feedback time, so changing a template never rewrites what an
// interviewer was actually asked.
@Entity('interview_feedback_skills')
@Index(['organizationId', 'feedbackId', 'skill'], { unique: true })
export class InterviewFeedbackSkill extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  feedbackId!: string;

  @Column({ type: 'varchar', length: 120 })
  skill!: string;

  @Column({ type: 'int' })
  score!: number;
}
