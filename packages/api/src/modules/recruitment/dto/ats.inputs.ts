import { APPLICATION_OUTCOMES, APPLICATION_STAGES } from '@hrms/shared';
import { Field, Int, InputType } from '@nestjs/graphql';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

@InputType()
export class CreateCandidateInput {
  @Field()
  @IsString()
  @MaxLength(200)
  fullName!: string;

  @Field()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  linkedin?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  portfolio?: string;
}

@InputType()
export class UpdateApplicationInput {
  @Field()
  @IsUUID()
  applicationId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...APPLICATION_STAGES])
  stage?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...APPLICATION_OUTCOMES])
  outcome?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  onHold?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  holdReason?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  manualRating?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

@InputType()
export class PublishHiringRequestInput {
  @Field()
  @IsUUID()
  hiringRequestId!: string;

  // The workspace the request belongs to. The Tethr board passes the row's
  // organization so the request is read there while the posting is created in
  // Tethr's own workspace; the service verifies the caller is an operator.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  organizationId?: string | null;
}
