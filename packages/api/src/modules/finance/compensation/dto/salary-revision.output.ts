import { Field, Float, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('SalaryRevision')
export class SalaryRevisionView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => ID)
  salaryStructureId!: string;

  @Field()
  validFrom!: string;

  @Field(() => String, { nullable: true })
  validTo!: string | null;

  @Field()
  currency!: string;

  @Field(() => Float)
  annualAmount!: number;

  @Field()
  reason!: string;

  @Field(() => ID, { nullable: true })
  approvedByUserId!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;
}
