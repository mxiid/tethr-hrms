import type { HiringRequestPriority, HiringRequestStatus, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A client-owned staffing request: what the client briefed us (the role, its
// description, the money, who owns it). Candidate, posting, and pipeline
// records reference it by id and live in Tethr's workspace.
@Entity('hiring_requests')
@Index(['organizationId', 'status'])
export class HiringRequest extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 200 })
  positionTitle!: string;

  @Column({ type: 'text', nullable: true })
  jobDescription!: string | null;

  @Column({ type: 'int', default: 1 })
  headcount!: number;

  @Column({ type: 'varchar', length: 16, default: 'permanent' })
  employmentType!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location!: string | null;

  @Column({ type: 'date', nullable: true })
  preferredStartDate!: string | null;

  // The date we want the hire closed by — a deadline on us, distinct from the
  // preferred start date (which drives the offer's start date later).
  @Column({ type: 'date', nullable: true })
  targetFillDate!: string | null;

  // numeric-as-string to avoid money drift (same convention as salary revisions).
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMin!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMax!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  salaryCurrency!: string | null;

  // Id-only references (no cross-module FKs): an employee of the client
  // workspace. The hiring manager owns the role; reports-to seeds the position
  // hierarchy when the request opens.
  @Column({ type: 'uuid', nullable: true })
  hiringManagerEmployeeId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reportsToEmployeeId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'normal' })
  priority!: HiringRequestPriority;

  // Set when the request opens: the position this requisition maps to.
  @Column({ type: 'uuid', nullable: true })
  positionId!: string | null;

  @Column({ type: 'text', nullable: true })
  clientNote!: string | null;

  @Column({ type: 'text', nullable: true })
  tethrNote!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'submitted' })
  status!: HiringRequestStatus;

  @Column({ type: 'uuid' })
  requestedByUserId!: UserId;

  @Column({ type: 'uuid', nullable: true })
  updatedByUserId!: UserId | null;
}
