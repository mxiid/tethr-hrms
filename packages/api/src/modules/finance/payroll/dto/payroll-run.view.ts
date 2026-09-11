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

  @Field()
  dependsOnPaymentDays!: boolean;

  // Full-period entitlement; `amount` is what was actually paid after pro-rating.
  @Field(() => Number)
  defaultAmount!: number;

  @Field(() => Number)
  amount!: number;

  @Field(() => String, { nullable: true })
  sourceType!: string | null;

  @Field(() => String, { nullable: true })
  sourceId!: string | null;
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

  @Field(() => String, { nullable: true })
  roleTitle!: string | null;

  @Field(() => String, { nullable: true })
  hireDate!: string | null;

  @Field(() => String, { nullable: true })
  employmentStatus!: string | null;

  @Field(() => Number)
  payableDays!: number;

  @Field(() => Number)
  lopDays!: number;

  // The line's own working-day denominator (per-employee calendar when set).
  @Field(() => Number)
  standardWorkingDays!: number;

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

  @Field(() => String, { nullable: true })
  finalizeOverrideReason!: string | null;

  @Field()
  isStale!: boolean;

  @Field(() => String, { nullable: true })
  staleReason!: string | null;

  @Field(() => [PayrollRunLineView], { nullable: true })
  lines?: PayrollRunLineView[];
}
