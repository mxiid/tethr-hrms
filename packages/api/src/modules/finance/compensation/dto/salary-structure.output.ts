import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('SalaryStructure')
export class SalaryStructureView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  code!: string;

  @Field(() => ID, { nullable: true })
  gradeId!: string | null;

  @Field()
  currency!: string;

  @Field()
  payFrequency!: string;

  @Field()
  isActive!: boolean;
}
