import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

@InputType()
export class CreatePayAdjustmentInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID)
  @IsUUID()
  componentId!: string;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @Field()
  @IsString()
  currency!: string;

  @Field(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @Field(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @Field()
  @IsIn(['bonus', 'encashment', 'advanceRecovery', 'arrear', 'correction', 'other'])
  kind!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  sourceType?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  overwritesStructureAmount?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  recurringFrom?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  recurringTo?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
