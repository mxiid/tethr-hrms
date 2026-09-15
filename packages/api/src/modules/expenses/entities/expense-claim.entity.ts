import type {
  EmployeeId,
  ExpenseClaimStatus,
  ExpenseReimbursementMethod,
  UserId,
} from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One employee expense claim. Money facts are snapshotted server-side from the
// lines (`totalAmount`/`billableAmount`); approval rides the generic
// WorkflowService (`subjectType 'expenseClaim'`) so decisions share one trail.
// A claim is payable once approved; `paid` records how the money was committed
// — directly, or by scheduling a payroll `reimbursement` adjustment (whose id
// is kept so a payslip line traces back here).
@Entity('expense_claims')
@Index(['organizationId', 'employeeId'])
@Index(['organizationId', 'status'])
@Index('expense_claims_org_number_unique', ['organizationId', 'claimNumber'], {
  unique: true,
  where: '"claimNumber" IS NOT NULL',
})
export class ExpenseClaim extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  // Assigned at submit (EXP-0001) so abandoned drafts never burn numbers.
  @Column({ type: 'varchar', length: 32, nullable: true, default: null })
  claimNumber!: string | null;

  @Column({ type: 'varchar', length: 300 })
  purpose!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: ExpenseClaimStatus;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  totalAmount!: string;

  // Sum of lines whose category is billable to the client.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  billableAmount!: string;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  submittedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  approvalRequestId!: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  decidedByUserId!: UserId | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  decidedAt!: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true, default: null })
  decisionNote!: string | null;

  // --- Reimbursement ---
  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  reimbursementMethod!: ExpenseReimbursementMethod | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  reimbursedAt!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true, default: null })
  reimbursementReference!: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  payrollAdjustmentId!: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  reimbursementPeriodYear!: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  reimbursementPeriodMonth!: number | null;

  // --- Client pass-through ---
  @Column({ type: 'uuid', nullable: true, default: null })
  billedInvoiceId!: string | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  billedAt!: Date | null;
}
