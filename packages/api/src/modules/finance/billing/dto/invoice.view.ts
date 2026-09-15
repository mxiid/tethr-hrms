import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('InvoiceLine')
class InvoiceLineView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field()
  kind!: string;

  @Field(() => ID, { nullable: true })
  employeeId!: string | null;

  @Field(() => String, { nullable: true })
  employeeName!: string | null;

  @Field(() => String, { nullable: true })
  monthLabel!: string | null;

  @Field()
  description!: string;

  @Field(() => Number)
  quantity!: number;

  @Field(() => Number)
  unitPrice!: number;

  @Field(() => Number)
  total!: number;
}

@ObjectType('Invoice')
export class InvoiceView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String, { nullable: true })
  groupName?: string | null;

  @Field()
  type!: string;

  @Field()
  status!: string;

  @Field(() => Number)
  serviceYear!: number;

  @Field(() => Number)
  serviceMonth!: number;

  @Field()
  periodStart!: string;

  @Field()
  periodEndExclusive!: string;

  // Null while draft; assigned at issue (e.g. SP0006).
  @Field(() => String, { nullable: true })
  number!: string | null;

  @Field(() => String, { nullable: true })
  issueDate!: string | null;

  @Field(() => String, { nullable: true })
  dueDate!: string | null;

  @Field()
  currency!: string;

  @Field(() => String, { nullable: true })
  receiverName!: string | null;

  @Field(() => Number)
  subTotal!: number;

  @Field(() => Number)
  totalAmount!: number;

  @Field(() => String, { nullable: true })
  paidAt!: string | null;

  @Field(() => String, { nullable: true })
  paymentReference!: string | null;

  // Reconciliation against the covering payroll run: `pending` on fresh drafts.
  @Field()
  reconciliationStatus!: string;

  @Field(() => Number, { nullable: true })
  payrollCostAmount!: number | null;

  @Field(() => Date, { nullable: true })
  reconciledAt!: Date | null;

  // A rate/membership edit made the draft's amounts outdated.
  @Field()
  isStale!: boolean;

  @Field(() => String, { nullable: true })
  staleReason!: string | null;

  @Field(() => [InvoiceLineView], { nullable: true })
  lines?: InvoiceLineView[];
}

@ObjectType('ClientCostByEmployee')
class ClientCostByEmployeeView {
  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  employeeName!: string | null;

  @Field(() => Number)
  total!: number;
}

@ObjectType('ClientCostByPeriod')
class ClientCostByPeriodView {
  @Field(() => Number)
  serviceYear!: number;

  @Field(() => Number)
  serviceMonth!: number;

  @Field(() => Number)
  total!: number;
}

@ObjectType('ClientCostBreakdown')
export class ClientCostBreakdownView {
  @Field(() => Number)
  totalBilled!: number;

  @Field()
  currency!: string;

  @Field(() => [ClientCostByEmployeeView])
  byEmployee!: ClientCostByEmployeeView[];

  @Field(() => [ClientCostByPeriodView])
  byPeriod!: ClientCostByPeriodView[];
}

