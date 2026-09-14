import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A minted upload ticket. The public form hands out a signed PUT URL and
// records exactly what it issued (key, field, expected size/type, expiry);
// submission only accepts files that match an unused, unexpired ticket *and*
// exist in storage. That closes the "fabricate a plausible key" gap.
@Entity('form_upload_tickets')
@Index(['organizationId', 'storageKey'], { unique: true })
export class FormUploadTicket extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  formId!: string;

  @Column({ type: 'varchar', length: 64 })
  fieldKey!: string;

  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 128 })
  contentType!: string;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
