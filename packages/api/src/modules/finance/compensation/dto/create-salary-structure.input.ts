import { Field, ID, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

@InputType()
export class CreateSalaryStructureInput {
  @Field()
  @IsString()
  @MaxLength(64)
  name!: string;

  @Field()
  @IsString()
  @MaxLength(32)
  code!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @Field()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['monthly', 'semiMonthly', 'biweekly', 'weekly'])
  payFrequency?: string;
}
