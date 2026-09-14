import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayrollReadinessBlocker')
class PayrollReadinessBlockerView {
  @Field()
  code!: string;

  @Field()
  severity!: string;

  @Field()
  message!: string;
}

@ObjectType('EmployeePayrollReadiness')
export class EmployeePayrollReadinessView {
  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  displayName!: string | null;

  @Field(() => [PayrollReadinessBlockerView])
  blockers!: PayrollReadinessBlockerView[];
}

@ObjectType('PayrollReadiness')
export class PayrollReadinessView {
  @Field(() => Number)
  periodYear!: number;

  @Field(() => Number)
  periodMonth!: number;

  @Field(() => Number)
  hardBlockerCount!: number;

  @Field(() => Number)
  warningCount!: number;

  @Field(() => [EmployeePayrollReadinessView])
  employees!: EmployeePayrollReadinessView[];
}
