import type { ShortlistDecision } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A candidate's place in one round. The client's verdict is modelled directly
// here (not through WorkflowService): it is per-candidate feedback, and the
// entry is also the anchor SQL for the client's narrow projection.
@Entity('shortlist_entries')
@Index(['organizationId', 'shortlistId', 'applicationId'], { unique: true })
export class ShortlistEntry extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  shortlistId!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'int' })
  rank!: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  clientDecision!: ShortlistDecision;

  @Column({ type: 'text', nullable: true })
  clientNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;
}
