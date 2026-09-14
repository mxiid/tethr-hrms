import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BonusAward')
export class BonusAwardView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field()
  awardDate!: string;

  @Field()
  currency!: string;

  @Field()
  amount!: number;

  @Field()
  reason!: string;

  @Field(() => ID, { nullable: true })
  approvedByUserId!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;
}
