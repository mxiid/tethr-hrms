import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayslipLine')
export class PayslipLineView {
  @Field(() => ID)
  id!: string;

  @Field()
  componentCode!: string;

  @Field()
  componentName!: string;

  @Field()
  category!: string;

  @Field()
  taxable!: boolean;

  @Field()
  dependsOnPaymentDays!: boolean;

  // A pre-tax deduction reduces the taxable base before withholding.
  @Field()
  preTax!: boolean;

  @Field(() => Number)
  defaultAmount!: number;

  @Field(() => Number)
  amount!: number;

  @Field(() => String, { nullable: true })
  sourceType!: string | null;

  @Field(() => String, { nullable: true })
  sourceId!: string | null;
}

@ObjectType('Payslip')
export class PayslipView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  runId!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field()
  payslipNumber!: string;

  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field()
  payDate!: string;

  @Field()
  currency!: string;

  @Field()
  employeeNumber!: string;

  @Field()
  employeeName!: string;

  @Field(() => String, { nullable: true })
  roleTitle!: string | null;

  @Field()
  hireDate!: string;

  @Field(() => Number)
  paidDays!: number;

  @Field(() => Number)
  lopDays!: number;

  @Field(() => Number)
  standardWorkingDays!: number;

  @Field(() => Number)
  grossAmount!: number;

  @Field(() => Number)
  deductionsAmount!: number;

  @Field(() => Number)
  taxableAmount!: number;

  @Field(() => Number)
  incomeTaxAmount!: number;

  @Field(() => Number)
  netPayAmount!: number;

  // Employer-side cost facts (never part of net pay).
  @Field(() => Number)
  employerContributionAmount!: number;

  @Field(() => Number)
  employerCostAmount!: number;

  // The withholding trail: `source` names what won (lineOverride/fixed/profile/
  // computed); the summary lists the profile facts that were applied.
  @Field(() => String, { nullable: true })
  taxProfileSource!: string | null;

  @Field(() => String, { nullable: true })
  taxProfileSummary!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [PayslipLineView], { nullable: true })
  lines?: PayslipLineView[];
}
