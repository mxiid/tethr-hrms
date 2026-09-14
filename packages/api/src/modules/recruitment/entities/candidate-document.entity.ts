import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A CV (or other candidate file) in object storage, versioned per candidate.
@Entity('candidate_documents')
@Index(['organizationId', 'candidateId', 'label', 'versionNumber'], { unique: true })
export class CandidateDocument extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  candidateId!: string;

  @Column({ type: 'varchar', length: 32, default: 'resume' })
  label!: string;

  @Column({ type: 'int', default: 1 })
  versionNumber!: number;

  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 128 })
  contentType!: string;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: string;
}
