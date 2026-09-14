import type { BillingGroupId, InvoiceStatus, InvoiceType, IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// A Tethr → client invoice for one billing group. Services invoices are drafted
// automatically when a payroll run finalizes (event-driven); expenses invoices
// are opened manually by finance with pass-through lines. Drafts are working
// state; issuing assigns the human number ({prefix}{sequence}) and freezes
// every displayed fact — later edits are impossible by construction.
@Entity('invoices')
@Index('invoices_org_group_type_period_unique', ['organizationId', 'groupId', 'type', 'serviceYear', 'serviceMonth'], { unique: true })
@Index('invoices_org_status_idx', ['organizationId', 'status'])
export class Invoice extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  groupId!: BillingGroupId;

  @Column({ type: 'varchar', length: 16 })
  type!: InvoiceType;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: InvoiceStatus;

  // The service month the invoice covers (advance-billed when cut on/after the
  // anchor day). Together with group + type it makes auto-drafting idempotent.
  @Column({ type: 'int' })
  serviceYear!: number;

  @Column({ type: 'int' })
  serviceMonth!: number;

  // Billing window shown on the document: [periodStart, periodEndExclusive).
  // Anchor day to anchor day (default 20th → 20th).
  @Column({ type: 'date' })
  periodStart!: IsoDate;

  @Column({ type: 'date' })
  periodEndExclusive!: IsoDate;

  // Human number, e.g. SP0006. Null while draft — assigned only at issue.
  @Column({ type: 'varchar', length: 32, nullable: true, default: null })
  number!: string | null;

  @Column({ type: 'date', nullable: true, default: null })
  issueDate!: IsoDate | null;

  @Column({ type: 'date', nullable: true, default: null })
  dueDate!: IsoDate | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  // --- Receiver snapshot (frozen at creation; edits never rewrite history) ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  receiverName!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  receiverAddress!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  receiverEmail!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  receiverPhone!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  receiverZipCode!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  receiverCity!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  receiverCountry!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0.00' })
  subTotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0.00' })
  totalAmount!: string;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  paidAt!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true, default: null })
  paymentReference!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourcePayrollRunId!: string | null;
}

