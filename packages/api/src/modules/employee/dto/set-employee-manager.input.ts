import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, Matches } from 'class-validator';

@InputType()
export class SetEmployeeManagerInput {
  @Field(() => ID)
  @IsString()
  employeeId!: string;

  /** Null clears the reporting line, which makes the employee a root. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  reportsToEmployeeId?: string | null;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must be an ISO date (YYYY-MM-DD)' })
  effectiveDate!: string;
}
