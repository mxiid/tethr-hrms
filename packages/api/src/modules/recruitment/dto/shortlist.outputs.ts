import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ShortlistEntry')
export class ShortlistEntryView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  applicationId!: string;

  @Field(() => ID)
  candidateId!: string;

  @Field()
  candidateName!: string;

  @Field()
  candidateEmail!: string;

  @Field(() => String, { nullable: true })
  currentTitle!: string | null;

  @Field(() => Int, { nullable: true })
  yearsExperience!: number | null;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field(() => Float, { nullable: true })
  expectedSalary!: number | null;

  @Field(() => String, { nullable: true })
  salaryCurrency!: string | null;

  // Tethr-internal judgment; never part of the client projection.
  @Field(() => Int, { nullable: true })
  manualRating!: number | null;

  @Field(() => Int)
  rank!: number;

  @Field()
  clientDecision!: string;

  @Field(() => String, { nullable: true })
  clientNote!: string | null;

  @Field()
  hasResume!: boolean;
}

@ObjectType('Shortlist')
export class ShortlistView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobPostingId!: string;

  @Field()
  jobPostingTitle!: string;

  @Field(() => Int)
  roundNumber!: number;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  presentedAt!: string | null;

  @Field(() => String, { nullable: true })
  closedAt!: string | null;

  @Field()
  createdAt!: string;

  @Field(() => [ShortlistEntryView])
  entries!: ShortlistEntryView[];
}

// The client's narrow projection: the candidates presented, nothing internal.
@ObjectType('ClientShortlistEntry')
export class ClientShortlistEntryView {
  @Field(() => ID)
  id!: string;

  @Field()
  candidateName!: string;

  @Field(() => String, { nullable: true })
  currentTitle!: string | null;

  @Field(() => Int, { nullable: true })
  yearsExperience!: number | null;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field(() => String, { nullable: true })
  skills!: string | null;

  @Field(() => String, { nullable: true })
  coverNote!: string | null;

  @Field(() => Float, { nullable: true })
  expectedSalary!: number | null;

  @Field(() => String, { nullable: true })
  salaryCurrency!: string | null;

  @Field(() => Int)
  rank!: number;

  @Field()
  clientDecision!: string;

  @Field(() => String, { nullable: true })
  clientNote!: string | null;
}

@ObjectType('ClientShortlist')
export class ClientShortlistView {
  @Field(() => ID)
  id!: string;

  @Field()
  jobPostingTitle!: string;

  @Field(() => Int)
  roundNumber!: number;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  presentedAt!: string | null;

  @Field(() => [ClientShortlistEntryView])
  entries!: ClientShortlistEntryView[];
}

@ObjectType('ShortlistDecisionResult')
export class ShortlistDecisionResultView {
  @Field(() => ID)
  shortlistEntryId!: string;

  @Field()
  clientDecision!: string;

  @Field(() => String, { nullable: true })
  clientNote!: string | null;
}
