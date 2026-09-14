import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class DecideBankDetailChangeInput {
  @Field(() => ID)
  @IsUUID()
  requestId!: string;

  @Field()
  @IsBoolean()
  approve!: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
