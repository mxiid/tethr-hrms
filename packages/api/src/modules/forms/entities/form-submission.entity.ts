import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

export type FormSubmissionFile = {
  readonly fieldKey: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
};

// `pending` until the target consumer acts; `projected` once its downstream
// record exists; `rejected` when the target refused it (e.g. a closed posting)
// — stored rather than dropped so staff can see late applications.
export type FormSubmissionStatus = 'pending' | 'projected' | 'rejected';

// One anonymous submission. Answers are stored as submitted (jsonb); file
// answers keep their signed-storage key. `targetRefType`/`targetRefId` are
// filled by the projection consumer once it creates the downstream record
// (e.g. an Application), linking the raw submission to what it produced.
@Entity('form_submissions')
@Index(['organizationId', 'formId'])
export class FormSubmission extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  formId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  answers!: Record<string, string>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  files!: FormSubmissionFile[];

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: FormSubmissionStatus;

  @Column({ type: 'text', nullable: true })
  statusReason!: string | null;

  @Column({ type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32, nullable: true })
  targetRefType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetRefId!: string | null;
}
