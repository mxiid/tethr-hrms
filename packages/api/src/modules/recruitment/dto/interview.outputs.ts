import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('InterviewRound')
export class InterviewRoundView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => Int)
  orderIndex!: number;

  @Field(() => [String])
  skills!: string[];

  @Field(() => Float, { nullable: true })
  expectedRating!: number | null;
}

@ObjectType('InterviewPanelMember')
export class InterviewPanelMemberView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  userId!: string | null;

  // Human-readable name: the linked user's email when internal, the external
  // name otherwise.
  @Field()
  displayName!: string;

  @Field(() => String, { nullable: true })
  externalEmail!: string | null;

  @Field()
  hasFiledFeedback!: boolean;
}

@ObjectType('InterviewSkillScore')
export class InterviewSkillScoreView {
  @Field()
  skill!: string;

  @Field(() => Int)
  score!: number;
}

@ObjectType('InterviewFeedback')
export class InterviewFeedbackView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  panelMemberId!: string;

  @Field(() => ID)
  recordedByUserId!: string;

  @Field(() => String, { nullable: true })
  overallNote!: string | null;

  @Field()
  submittedAt!: string;

  @Field(() => Float, { nullable: true })
  average!: number | null;

  @Field(() => [InterviewSkillScoreView])
  scores!: InterviewSkillScoreView[];
}

@ObjectType('InterviewSkillAverage')
export class InterviewSkillAverageView {
  @Field()
  skill!: string;

  @Field(() => Float)
  average!: number;
}

@ObjectType('Interview')
export class InterviewView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  applicationId!: string;

  @Field()
  candidateName!: string;

  @Field()
  jobPostingTitle!: string;

  @Field(() => InterviewRoundView)
  round!: InterviewRoundView;

  @Field()
  scheduledAt!: string;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  outcome!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => Float, { nullable: true })
  average!: number | null;

  @Field(() => [InterviewSkillAverageView])
  skillAverages!: InterviewSkillAverageView[];

  @Field(() => [InterviewPanelMemberView])
  panel!: InterviewPanelMemberView[];

  @Field(() => [InterviewFeedbackView])
  feedbacks!: InterviewFeedbackView[];

  // "N of M filed" chasing helper.
  @Field(() => Int)
  feedbacksExpected!: number;
}

// The client's read-only projection of interview outcomes.
@ObjectType('ClientInterviewOutcome')
export class ClientInterviewOutcomeView {
  @Field(() => ID)
  interviewId!: string;

  @Field()
  roundName!: string;

  @Field()
  jobPostingTitle!: string;

  @Field()
  scheduledAt!: string;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  outcome!: string | null;
}
