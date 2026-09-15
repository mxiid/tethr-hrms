import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('ExpenseCategory')
export class ExpenseCategoryView {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field()
  requiresReceipt!: boolean;

  @Field()
  billableToClient!: boolean;

  @Field()
  isActive!: boolean;
}

@ObjectType('ExpenseReceiptUpload')
export class ExpenseReceiptUploadView {
  @Field()
  storageKey!: string;

  @Field()
  url!: string;

  @Field()
  method!: string;

  @Field()
  expiresAt!: string;

  @Field(() => [ExpenseReceiptHeaderView])
  headers!: ExpenseReceiptHeaderView[];
}

@ObjectType('ExpenseReceiptHeader')
export class ExpenseReceiptHeaderView {
  @Field()
  name!: string;

  @Field()
  value!: string;
}

@ObjectType('ExpenseClaimLine')
export class ExpenseClaimLineView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  categoryId!: string;

  @Field(() => String, { nullable: true })
  categoryName!: string | null;

  @Field()
  expenseDate!: string;

  @Field()
  description!: string;

  @Field(() => Number)
  amount!: number;

  @Field()
  hasReceipt!: boolean;

  @Field(() => String, { nullable: true })
  receiptFileName!: string | null;
}

@ObjectType('ExpenseClaim')
export class ExpenseClaimView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  claimNumber!: string | null;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  employeeName!: string | null;

  // Populated on the Tethr cross-workspace board; null for single-workspace reads.
  @Field(() => ID, { nullable: true })
  organizationId!: string | null;

  @Field(() => String, { nullable: true })
  organizationName!: string | null;

  @Field()
  purpose!: string;

  @Field()
  status!: string;

  @Field()
  currency!: string;

  @Field(() => Number)
  totalAmount!: number;

  @Field(() => Number)
  billableAmount!: number;

  @Field(() => Date, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  decidedAt!: Date | null;

  @Field(() => String, { nullable: true })
  decisionNote!: string | null;

  @Field(() => String, { nullable: true })
  reimbursementMethod!: string | null;

  @Field(() => Date, { nullable: true })
  reimbursedAt!: Date | null;

  @Field(() => String, { nullable: true })
  reimbursementReference!: string | null;

  @Field(() => Number, { nullable: true })
  reimbursementPeriodYear!: number | null;

  @Field(() => Number, { nullable: true })
  reimbursementPeriodMonth!: number | null;

  @Field(() => ID, { nullable: true })
  billedInvoiceId!: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => [ExpenseClaimLineView])
  lines!: ExpenseClaimLineView[];
}

@ObjectType('BillExpenseClaimResult')
export class BillExpenseClaimResultView {
  @Field(() => ExpenseClaimView)
  claim!: ExpenseClaimView;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Number)
  addedLines!: number;
}
