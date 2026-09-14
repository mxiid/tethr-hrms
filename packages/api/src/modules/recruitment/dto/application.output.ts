import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Application')
export class ApplicationView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  candidateId!: string;

  @Field()
  candidateName!: string;

  @Field(() => ID)
  jobPostingId!: string;

  @Field()
  jobPostingTitle!: string;

  @Field()
  stage!: string;

  @Field()
  outcome!: string;

  @Field()
  onHold!: boolean;

  @Field(() => String, { nullable: true })
  holdReason!: string | null;

  @Field(() => Float, { nullable: true })
  expectedSalary!: number | null;

  @Field(() => String, { nullable: true })
  salaryCurrency!: string | null;

  @Field(() => Float, { nullable: true })
  currentSalary!: number | null;

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

  // Human judgment, separate from the AI score the parse seam will fill.
  @Field(() => Int, { nullable: true })
  manualRating!: number | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field()
  hasResume!: boolean;

  @Field()
  createdAt!: string;
}
