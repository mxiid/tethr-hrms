import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('SalaryStructureComponent')
export class SalaryStructureComponentView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  structureId!: string;

  @Field(() => ID)
  componentId!: string;

  @Field()
  calcType!: string;

  @Field(() => Number)
  value!: number;

  @Field(() => Number)
  sortOrder!: number;
}
