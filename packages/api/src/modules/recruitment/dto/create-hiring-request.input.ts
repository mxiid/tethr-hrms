import { HIRING_REQUEST_PRIORITIES } from '@hrms/shared';
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@InputType()
export class CreateHiringRequestInput {
  @Field()
  @IsString()
  @MaxLength(200)
  positionTitle!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobDescription?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['permanent', 'fixedTerm', 'contractor', 'intern', 'temporary'])
  employmentType?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'preferredStartDate must be an ISO date (YYYY-MM-DD)' })
  preferredStartDate?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'targetFillDate must be an ISO date (YYYY-MM-DD)' })
  targetFillDate?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  salaryCurrency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  hiringManagerEmployeeId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  reportsToEmployeeId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...HIRING_REQUEST_PRIORITIES])
  priority?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clientNote?: string;
}
