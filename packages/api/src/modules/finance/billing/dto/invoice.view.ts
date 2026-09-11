import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('InvoiceLine')
export class InvoiceLineView {
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
  paidAt!: Date | null;

  @Field(() => String, { nullable: true })
  paymentReference!: string | null;

  @Field(() => [InvoiceLineView], { nullable: true })
  lines?: InvoiceLineView[];
}

