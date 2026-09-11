import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('TaxSlab')
export class TaxSlabView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  groupId!: string;

  @Field(() => Number)
  sortOrder!: number;

  // null = open top band.
  @Field(() => Number, { nullable: true })
  upperBound!: number | null;

  @Field(() => Number)
  ratePercent!: number;

  @Field(() => Number)
  flatAdditive!: number;
}

@ObjectType('TaxSlabGroup')
export class TaxSlabGroupView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  financialYearLabel!: string;

  @Field()
  currency!: string;

  @Field()
  isActive!: boolean;

  @Field(() => [TaxSlabView], { nullable: true })
  slabs?: TaxSlabView[];
}
