import type { IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One receipted spend on a claim. The category is an id reference (no
// cross-module FK); the receipt's storage facts are snapshotted so the line
// still describes the document even if the object is later replaced.
@Entity('expense_claim_lines')
@Index(['organizationId', 'claimId'])
export class ExpenseClaimLine extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  claimId!: string;

  @Column({ type: 'uuid' })
  categoryId!: string;

  @Column({ type: 'date' })
  expenseDate!: IsoDate;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  receiptStorageKey!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiptFileName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  receiptContentType!: string | null;

  @Column({ type: 'bigint', nullable: true })
  receiptSizeBytes!: string | null;
}
