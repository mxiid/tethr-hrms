import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayrollRunLineComponent')
export class PayrollRunLineComponentView {
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

@ObjectType('PayrollRunLine')
export class PayrollRunLineView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  runId!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  displayName!: string | null;

  @Field(() => Number)
  payableDays!: number;

  @Field(() => Number)
  lopDays!: number;

  @Field(() => Number)
  grossAmount!: number;

  // null = engine computed; a number = finance override in force.
  @Field(() => Number, { nullable: true })
  taxOverrideAmount!: number | null;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Number)
  totalEarnings!: number;

  @Field(() => Number)
  taxableAmount!: number;

  @Field(() => Number)
  incomeTax!: number;

  @Field(() => Number)
  netPayAmount!: number;

  @Field(() => [PayrollRunLineComponentView])
  components!: PayrollRunLineComponentView[];
}

@ObjectType('PayrollRun')
export class PayrollRunView {
  @Field(() => ID)
  id!: string;

  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field()
  status!: string;

  @Field()
  currency!: string;

  @Field(() => Number)
  standardWorkingDays!: number;

  @Field(() => ID, { nullable: true })
  holidayCalendarId!: string | null;

  @Field(() => Date, { nullable: true })
  finalizedAt!: Date | null;

  @Field(() => [PayrollRunLineView], { nullable: true })
  lines?: PayrollRunLineView[];
}
