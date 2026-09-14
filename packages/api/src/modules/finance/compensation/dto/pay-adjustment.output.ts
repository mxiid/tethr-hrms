import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayAdjustment')
export class PayAdjustmentView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => ID)
  componentId!: string;

  @Field(() => Number)
  amount!: number;

  @Field()
  currency!: string;

  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field()
  kind!: string;

  @Field(() => String, { nullable: true })
  sourceType!: string | null;

  @Field(() => String, { nullable: true })
  sourceId!: string | null;

  @Field()
  overwritesStructureAmount!: boolean;

  @Field()
  isRecurring!: boolean;

  @Field(() => String, { nullable: true })
  recurringFrom!: string | null;

  @Field(() => String, { nullable: true })
  recurringTo!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;
}
