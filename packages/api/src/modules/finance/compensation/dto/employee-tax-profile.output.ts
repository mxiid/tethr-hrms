import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('EmployeeTaxProfile')
export class EmployeeTaxProfileView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field()
  filerStatus!: string;

  @Field(() => Number)
  monthlyExemptionAmount!: number;

  @Field(() => Number)
  annualTaxCreditAmount!: number;

  @Field(() => Number)
  priorAnnualIncome!: number;

  @Field(() => Number, { nullable: true })
  fixedMonthlyWithholding!: number | null;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field()
  validFrom!: string;

  @Field(() => String, { nullable: true })
  validTo!: string | null;
}
