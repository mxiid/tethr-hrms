import type { ApplicationOutcome, ApplicationStage } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// The join between a person and an opening, and where the pipeline lives.
// Snapshot columns record what the candidate told us at submission time — a
// later re-application must not silently rewrite this history.
@Entity('applications')
@Index(['organizationId', 'jobPostingId'])
@Index(['organizationId', 'candidateId'])
// One OPEN application per person and posting. A rejected or withdrawn
// application stays historical, so the same candidate may re-apply later as a
// new row; two simultaneous open applications cannot exist.
@Index('applications_org_candidate_posting_active_unique', ['organizationId', 'candidateId', 'jobPostingId'], {
  unique: true,
  where: `"outcome" = 'active'`,
})
export class Application extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  candidateId!: string;

  @Column({ type: 'uuid' })
  jobPostingId!: string;

  @Column({ type: 'uuid', nullable: true })
  formSubmissionId!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'screening' })
  stage!: ApplicationStage;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  outcome!: ApplicationOutcome;

  @Column({ type: 'boolean', default: false })
  onHold!: boolean;

  @Column({ type: 'text', nullable: true })
  holdReason!: string | null;

  // Snapshot facts (numeric-as-string money).
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  expectedSalary!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  salaryCurrency!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  currentSalary!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  currentTitle!: string | null;

  @Column({ type: 'int', nullable: true })
  yearsExperience!: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  skills!: string | null;

  @Column({ type: 'text', nullable: true })
  coverNote!: string | null;

  // Human judgment, deliberately separate from the AI score that lands later.
  @Column({ type: 'int', nullable: true })
  manualRating!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
