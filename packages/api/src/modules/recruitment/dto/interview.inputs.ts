import { INTERVIEW_OUTCOMES, INTERVIEW_STATUSES } from '@hrms/shared';
import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

@InputType()
export class CreateInterviewRoundInput {
  @Field()
  @IsString()
  @MaxLength(120)
  name!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  orderIndex?: number | null;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skills?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  expectedRating?: number | null;
}

@InputType()
export class InterviewPanelMemberInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  externalEmail?: string | null;
}

@InputType()
export class ScheduleInterviewInput {
  @Field(() => ID)
  @IsUUID()
  applicationId!: string;

  @Field(() => ID)
  @IsUUID()
  interviewRoundId!: string;

  @Field()
  @IsString()
  scheduledAt!: string;

  @Field(() => [InterviewPanelMemberInput])
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => InterviewPanelMemberInput)
  panel!: InterviewPanelMemberInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

@InputType()
export class UpdateInterviewInput {
  @Field(() => ID)
  @IsUUID()
  interviewId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...INTERVIEW_STATUSES])
  status?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...INTERVIEW_OUTCOMES])
  outcome?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

@InputType()
export class InterviewSkillScoreInput {
  @Field()
  @IsString()
  @MaxLength(120)
  skill!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}

@InputType()
export class RecordInterviewFeedbackInput {
  @Field(() => ID)
  @IsUUID()
  interviewId!: string;

  @Field(() => ID)
  @IsUUID()
  panelMemberId!: string;

  @Field(() => [InterviewSkillScoreInput])
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InterviewSkillScoreInput)
  scores!: InterviewSkillScoreInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  overallNote?: string | null;
}

@InputType()
export class FeedbackIdInput {
  @Field(() => ID)
  @IsUUID()
  feedbackId!: string;
}
