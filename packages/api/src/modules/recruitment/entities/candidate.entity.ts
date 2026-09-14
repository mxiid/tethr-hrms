import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A person, not an application: one row per candidate even when they apply to
// three roles. The agency's cross-client pool lives in Tethr's workspace, so a
// candidate rejected by one client can be presented to another. Email is the
// identity key (unique per workspace, normalized to lowercase at write time).
@Entity('candidates')
@Index(['organizationId', 'email'], { unique: true })
export class Candidate extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  linkedin!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  portfolio!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'form' })
  source!: string;

  @Column({ type: 'timestamptz', nullable: true })
  consentGivenAt!: Date | null;
}
