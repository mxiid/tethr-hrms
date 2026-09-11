import { ArgsType, Field, ID, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

@InputType()
export class CreatePayrollRunInput {
  @Field(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;
}

@InputType()
export class UpdatePayrollRunLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payableDays?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lopDays?: number;

  // Explicit null clears an override back to engine-computed tax.
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxOverrideAmount?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;
}

@ArgsType()
export class FinalizePayrollRunArgs {
  @Field(() => ID)
  @IsUUID()
  runId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'payDate must be an ISO date (YYYY-MM-DD)' })
  payDate?: string;
}

@InputType()
export class CreateTaxSlabGroupInput {
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  financialYearLabel!: string;

  @Field({ nullable: true })
  @IsOptional()
  currency?: string;
}

@InputType()
export class TaxSlabEntryInput {
  // Omit for the open top band — only valid on the final entry.
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  upperBound?: number | null;

  @Field(() => Number)
  @IsNumber()
  ratePercent!: number;

  @Field(() => Number)
  @IsNumber()
  flatAdditive!: number;
}

@ArgsType()
export class ReplaceTaxSlabsArgs {
  @Field(() => ID)
  @IsUUID()
  groupId!: string;

  @Field(() => [TaxSlabEntryInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxSlabEntryInput)
  slabs!: TaxSlabEntryInput[];
}
