import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('InvoiceReconciliationLine')
export class InvoiceReconciliationLineView {
  @Field(() => ID)
  invoiceId!: string;

  @Field(() => String, { nullable: true })
  number!: string | null;

  @Field(() => ID)
  groupId!: string;

  @Field()
  status!: string;

  @Field()
  reconciliationStatus!: string;

  @Field(() => Number)
  invoicedAmount!: number;

  @Field(() => Number, { nullable: true })
  payrollCostAmount!: number | null;

  @Field(() => Date, { nullable: true })
  reconciledAt!: Date | null;
}

// One service month on the reconciliation board: what was invoiced against what
// the month cost. `open` = no covering run has finalized yet.
@ObjectType('BillingReconciliationPeriod')
export class BillingReconciliationPeriodView {
  @Field(() => Number)
  serviceYear!: number;

  @Field(() => Number)
  serviceMonth!: number;

  @Field()
  status!: string;

  @Field()
  currency!: string;

  @Field(() => Number)
  invoiceCount!: number;

  @Field(() => Number)
  invoicedAmount!: number;

  @Field(() => Number, { nullable: true })
  payrollCostAmount!: number | null;

  @Field(() => Number, { nullable: true })
  varianceAmount!: number | null;

  @Field(() => ID, { nullable: true })
  payrollRunId!: string | null;

  @Field(() => String, { nullable: true })
  payDate!: string | null;

  @Field(() => [InvoiceReconciliationLineView])
  invoices!: InvoiceReconciliationLineView[];
}
