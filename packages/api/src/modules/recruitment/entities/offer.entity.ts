import type { OfferStatus } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// An offer hangs off the application. The core terms are typed columns (base
// salary, start date, probation, notice) rather than Frappe's generic key/value
// bag — unqueryable and uncomparable; `extras` is for genuine one-offs only.
@Entity('offers')
@Index(['organizationId', 'applicationId'])
export class Offer extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  baseSalary!: string;

  @Column({ type: 'varchar', length: 3 })
  salaryCurrency!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'int', nullable: true })
  probationDays!: number | null;

  @Column({ type: 'int', nullable: true })
  noticePeriodDays!: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  extras!: { readonly label: string; readonly value: string }[];

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: OfferStatus;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  // Set on acceptance: the employee created in the client's workspace, so the
  // hire traces to this offer (and through it to the application and request).
  @Column({ type: 'uuid', nullable: true })
  hiredEmployeeId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
