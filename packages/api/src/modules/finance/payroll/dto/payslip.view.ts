import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayslipLine')
export class PayslipLineView {
  @Field(() => ID)
  id!: string;

  @Field()
  componentCode!: string;

  @Field()
  componentName!: string;

  @Field()
  category!: string;

  @Field()
  taxable!: boolean;

  @Field(() => Number)
  amount!: number;
}

@ObjectType('Payslip')
export class PayslipView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  runId!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field()
  payslipNumber!: string;

  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field()
  payDate!: string;

  @Field()
  currency!: string;

  @Field()
  employeeNumber!: string;

  @Field()
  employeeName!: string;

  @Field(() => String, { nullable: true })
  roleTitle!: string | null;

  @Field()
  hireDate!: string;

  @Field(() => Number)
  paidDays!: number;

  @Field(() => Number)
  lopDays!: number;

  @Field(() => Number)
  grossAmount!: number;

  @Field(() => Number)
  taxableAmount!: number;

  @Field(() => Number)
  incomeTaxAmount!: number;

  @Field(() => Number)
  netPayAmount!: number;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [PayslipLineView], { nullable: true })
  lines?: PayslipLineView[];
}
