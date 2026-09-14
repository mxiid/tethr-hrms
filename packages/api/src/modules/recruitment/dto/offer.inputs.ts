import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

@InputType()
export class OfferExtraInput {
  @Field()
  @IsString()
  @MaxLength(120)
  label!: string;

  @Field()
  @IsString()
  @MaxLength(200)
  value!: string;
}

@InputType()
export class CreateOfferInput {
  @Field(() => ID)
  @IsUUID()
  applicationId!: string;

  @Field(() => Float)
  @IsNumber()
  @Min(1)
  baseSalary!: number;

  @Field()
  @IsString()
  @MaxLength(3)
  salaryCurrency!: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be an ISO date (YYYY-MM-DD)' })
  startDate!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  probationDays?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  noticePeriodDays?: number | null;

  @Field(() => [OfferExtraInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OfferExtraInput)
  extras?: OfferExtraInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

@InputType()
export class OfferIdInput {
  @Field(() => ID)
  @IsUUID()
  offerId!: string;
}

@InputType()
export class DeclineOfferInput {
  @Field(() => ID)
  @IsUUID()
  offerId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
