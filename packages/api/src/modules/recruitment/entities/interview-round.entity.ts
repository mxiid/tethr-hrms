import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// The reusable template for an interview step (Frappe's "Interview Type"):
// name, order in the sequence, the skills a scorecard covers, and the average
// rating we expect from a strong candidate.
@Entity('interview_rounds')
@Index(['organizationId', 'orderIndex'], { unique: true })
export class InterviewRound extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  orderIndex!: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  skills!: string[];

  @Column({ type: 'numeric', precision: 3, scale: 1, nullable: true })
  expectedRating!: string | null;
}
