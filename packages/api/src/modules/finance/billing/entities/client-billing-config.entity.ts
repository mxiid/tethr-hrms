import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// Per-tenant commercial terms for Tethr -> client billing. One row per
// organization, created lazily with the product defaults (PEPM fee, Net 7,
// anchor day 20). Receiver facts are snapshotted onto each invoice at draft
// time; later edits here never rewrite issued documents.
@Entity('client_billing_configs')
@Index('client_billing_configs_org_unique', ['organizationId'], { unique: true })
export class ClientBillingConfig extends TenantScopedEntity {
  // Flat per-employee-per-month management fee.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 300 })
  feeAmount!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  feeCurrency!: string;

  @Column({ type: 'int', default: 7 })
  paymentTermsNetDays!: number;

  // Invoices are cut when today's day-of-month reaches this anchor; on/after it
  // they cover the FOLLOWING month (advance billing), before it the current one.
  @Column({ type: 'int', default: 20 })
  anchorDay!: number;

  // --- Receiver (the client payer) snapshot source ---
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

  // --- Sender (Tethr) + payment instructions shown on the invoice ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  senderName!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  senderAddress!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  senderEmail!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  senderPhone!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  senderZipCode!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  senderCity!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  senderCountry!: string | null;

  // Branding assets as data URLs — the same shape Invoify stores, so ported
  // templates render them unchanged. Uploaded once in Billing → Setup.
  @Column({ type: 'text', nullable: true })
  invoiceLogoDataUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  signatureDataUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bankName!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bankAccountName!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  bankAccountNumber!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bankSwift!: string | null;
}
