import type { EmployeeId, InvoiceLineKind } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One billable row on an invoice. Salary/catch-up lines carry the employee and
// service-month label; fee lines mirror the PEPM charge per person; expense
// lines are free-form pass-throughs. `total` is server-computed as
// quantity x unitPrice — clients of this module never do their own math.
@Entity('invoice_lines')
@Index('invoice_lines_org_invoice_idx', ['organizationId', 'invoiceId'])
export class InvoiceLine extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  invoiceId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: InvoiceLineKind;

  @Column({ type: 'uuid', nullable: true })
  employeeId!: EmployeeId | null;

  // Display snapshot so renaming never rewrites an issued invoice.
  @Column({ type: 'varchar', length: 257, nullable: true })
  employeeName!: string | null;

  // Service month this line bills for, e.g. "September 2026" / "August 2026".
  @Column({ type: 'varchar', length: 32, nullable: true })
  monthLabel!: string | null;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '1' })
  quantity!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  total!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
