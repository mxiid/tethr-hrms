import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('FinalSettlement')
export class FinalSettlementView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field()
  terminationDate!: string;

  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field()
  currency!: string;

  @Field(() => Number)
  standardWorkingDays!: number;

  @Field(() => Number)
  workedDays!: number;

  @Field(() => Number)
  proRatedEarnings!: number;

  @Field(() => Number)
  adjustmentEarnings!: number;

  @Field(() => Number)
  leaveBalanceDays!: number;

  @Field(() => Number)
  leaveEncashmentAmount!: number;

  @Field(() => Number)
  recoveryAmount!: number;

  @Field(() => Number)
  payableTotal!: number;

  @Field(() => Number)
  taxableAmount!: number;

  @Field(() => Number)
  incomeTaxAmount!: number;

  @Field(() => Number)
  netPayableAmount!: number;

  @Field()
  status!: string;

  @Field(() => Date, { nullable: true })
  paidAt!: Date | null;

  @Field(() => String, { nullable: true })
  paymentReference!: string | null;

  @Field()
  computedAt!: Date;

  @Field(() => String, { nullable: true })
  note!: string | null;
}
