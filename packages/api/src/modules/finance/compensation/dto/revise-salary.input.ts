import { Field, Float, ID, InputType } from '@nestjs/graphql';
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
export class ReviseSalaryInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID)
  @IsUUID()
  salaryStructureId!: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveDate must be an ISO date (YYYY-MM-DD)',
  })
  effectiveDate!: string;

  @Field(() => Float)
  @IsNumber()
  @Min(0.01)
  annualAmount!: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['hire', 'merit', 'promotion', 'marketAdjustment', 'correction'])
  reason?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  approvedByUserId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
