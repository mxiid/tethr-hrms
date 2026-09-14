import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

import { ApplicationView } from './application.output';

@ObjectType('Candidate')
export class CandidateView {
  @Field(() => ID)
  id!: string;

  @Field()
  fullName!: string;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  linkedin!: string | null;

  @Field(() => String, { nullable: true })
  portfolio!: string | null;

  @Field()
  source!: string;

  @Field()
  createdAt!: string;

  @Field(() => Int)
  applicationCount!: number;
}

@ObjectType('CandidateDetail')
export class CandidateDetailView extends CandidateView {
  @Field(() => [ApplicationView])
  applications!: ApplicationView[];
}

@ObjectType('JobPosting')
export class JobPostingView {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field()
  slug!: string;

  @Field()
  isPublished!: boolean;

  @Field(() => String, { nullable: true })
  postedAt!: string | null;

  @Field(() => String, { nullable: true })
  closesOn!: string | null;

  @Field(() => Float, { nullable: true })
  salaryMin!: number | null;

  @Field(() => Float, { nullable: true })
  salaryMax!: number | null;

  @Field(() => String, { nullable: true })
  salaryCurrency!: string | null;

  @Field(() => ID)
  sourceHiringRequestId!: string;
}

@ObjectType('PublishedPosting')
export class PublishedPostingView {
  @Field(() => ID)
  jobPostingId!: string;

  @Field()
  title!: string;

  // The signed public path an applicant opens; carries the posting as context.
  @Field()
  applyPath!: string;
}
