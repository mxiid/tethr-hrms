import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('EmployeeOnboardingProgress')
export class EmployeeOnboardingProgressView {
  @Field(() => ID)
  employeeId!: string;

  @Field(() => Number)
  completed!: number;

  @Field(() => Number)
  total!: number;

  @Field()
  allComplete!: boolean;
}
