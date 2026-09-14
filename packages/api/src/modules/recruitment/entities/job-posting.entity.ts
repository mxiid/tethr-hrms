import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A published opening, created in Tethr's workspace from a client's hiring
// request. Cross-tenant references are by id only; `sourceOrganizationId` keeps
// the back-edge so the client's narrow projection can be filtered server-side.
// "Live" is derived (`isPublished` + `closesOn`), so no scheduler is needed to
// close postings.
@Entity('job_postings')
@Index(['organizationId', 'slug'], { unique: true })
export class JobPosting extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  sourceHiringRequestId!: string;

  @Column({ type: 'uuid' })
  sourceOrganizationId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 220 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMin!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMax!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  salaryCurrency!: string | null;

  // Two separate flags on purpose: "is it live" is independent of "what do we
  // disclose".
  @Column({ type: 'boolean', default: false })
  isPublished!: boolean;

  @Column({ type: 'boolean', default: true })
  publishSalaryRange!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt!: Date | null;

  @Column({ type: 'date', nullable: true })
  closesOn!: string | null;
}
