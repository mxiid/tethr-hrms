import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

export type CvParseStatus = 'pending' | 'parsed' | 'failed';

// The AI seam. The record is created when a CV is uploaded and a `parse-cv` job
// is enqueued; today's processor is a stub that leaves it `pending`. Manual
// scoring and every downstream step work without it, so the real parser slots
// into that one processor later.
@Entity('cv_parses')
@Index(['organizationId', 'candidateDocumentId'], { unique: true })
export class CvParse extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  candidateDocumentId!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: CvParseStatus;

  @Column({ type: 'text', nullable: true })
  extractedText!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  structured!: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  score!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  provider!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  parsedAt!: Date | null;
}
