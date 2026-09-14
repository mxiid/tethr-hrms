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
export class AwardBonusInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'awardDate must be an ISO date (YYYY-MM-DD)',
  })
  awardDate!: string;

  @Field()
  @IsString()
  @MaxLength(3)
  currency!: string;

  @Field()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @Field()
  @IsIn(['performance', 'retention', 'referral', 'spot', 'clientApproved', 'other'])
  reason!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  approvedByUserId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
