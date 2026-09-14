import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('OfferExtra')
export class OfferExtraView {
  @Field()
  label!: string;

  @Field()
  value!: string;
}

@ObjectType('Offer')
export class OfferView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  applicationId!: string;

  @Field()
  candidateName!: string;

  @Field()
  jobPostingTitle!: string;

  @Field(() => Float)
  baseSalary!: number;

  @Field()
  salaryCurrency!: string;

  @Field()
  startDate!: string;

  @Field(() => Int, { nullable: true })
  probationDays!: number | null;

  @Field(() => Int, { nullable: true })
  noticePeriodDays!: number | null;

  @Field(() => [OfferExtraView])
  extras!: OfferExtraView[];

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  sentAt!: string | null;

  @Field(() => String, { nullable: true })
  respondedAt!: string | null;

  @Field(() => String, { nullable: true })
  hiredEmployeeId!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;
}

@ObjectType('AcceptedOffer')
export class AcceptedOfferView {
  @Field(() => OfferView)
  offer!: OfferView;

  @Field(() => ID)
  employeeId!: string;
}
