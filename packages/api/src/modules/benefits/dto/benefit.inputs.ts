import { ArgsType, Field, ID, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateBenefitPlanInput {
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  employeeContributionAmount!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  employerContributionAmount!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  reducesTaxable?: boolean;
}

@InputType()
export class UpdateBenefitPlanInput {
  @Field(() => ID)
  @IsUUID()
  planId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  employeeContributionAmount?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  employerContributionAmount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  reducesTaxable?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class SetBenefitEnrollmentInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID)
  @IsUUID()
  planId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must be an ISO date (YYYY-MM-DD)' })
  effectiveDate?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

@ArgsType()
export class EndBenefitEnrollmentArgs {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID)
  @IsUUID()
  planId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be an ISO date (YYYY-MM-DD)' })
  endDate?: string;
}
