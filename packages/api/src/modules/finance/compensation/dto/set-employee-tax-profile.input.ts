import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class SetEmployeeTaxProfileInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must be an ISO date (YYYY-MM-DD)' })
  effectiveDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['filer', 'nonFiler'])
  filerStatus?: 'filer' | 'nonFiler';

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyExemptionAmount?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualTaxCreditAmount?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priorAnnualIncome?: number;

  // Null/omitted clears the override: a set replaces the open profile's facts.
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedMonthlyWithholding?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
