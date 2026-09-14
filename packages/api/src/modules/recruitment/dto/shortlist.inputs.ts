import { SHORTLIST_DECISIONS } from '@hrms/shared';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

@InputType()
export class CreateShortlistInput {
  @Field(() => ID)
  @IsUUID()
  jobPostingId!: string;

  // Ordered: the order given becomes the rank presented to the client.
  @Field(() => [ID])
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  applicationIds!: string[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number | null;
}

@InputType()
export class ShortlistIdInput {
  @Field(() => ID)
  @IsUUID()
  shortlistId!: string;
}

@InputType()
export class RecordShortlistDecisionInput {
  @Field(() => ID)
  @IsUUID()
  shortlistEntryId!: string;

  @Field()
  @IsIn([...SHORTLIST_DECISIONS])
  decision!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
