import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class CreatePayComponentInput {
  @Field()
  @IsString()
  @MaxLength(64)
  name!: string;

  @Field()
  @IsString()
  @MaxLength(32)
  code!: string;

  @Field()
  @IsIn(['earning', 'deduction', 'employerContribution'])
  category!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;
}
