import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BenefitPlan')
export class BenefitPlanView {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => Number)
  employeeContributionAmount!: number;

  @Field(() => Number)
  employerContributionAmount!: number;

  @Field()
  reducesTaxable!: boolean;

  @Field()
  isActive!: boolean;
}

@ObjectType('BenefitEnrollment')
export class BenefitEnrollmentView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => ID)
  planId!: string;

  @Field(() => String, { nullable: true })
  planCode!: string | null;

  @Field(() => String, { nullable: true })
  planName!: string | null;

  @Field(() => Number)
  employeeContributionAmount!: number;

  @Field(() => Number)
  employerContributionAmount!: number;

  @Field()
  reducesTaxable!: boolean;

  @Field()
  validFrom!: string;

  @Field(() => String, { nullable: true })
  validTo!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;
}
