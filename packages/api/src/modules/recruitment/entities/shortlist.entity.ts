import type { ShortlistStatus } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One batch of candidates presented to a client for a posting. The round number
// falls out of the model (unique per posting) rather than being a counter kept
// somewhere else: round 2 is the next five after round 1 closed with nothing.
@Entity('shortlists')
@Index(['organizationId', 'jobPostingId', 'roundNumber'], { unique: true })
export class Shortlist extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  jobPostingId!: string;

  @Column({ type: 'int' })
  roundNumber!: number;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  status!: ShortlistStatus;

  @Column({ type: 'timestamptz', nullable: true })
  presentedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
