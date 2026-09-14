import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

import { HiringRequestUpdateView } from './hiring-request-update.output';

@ObjectType('HiringRequest')
export class HiringRequestView {
  @Field(() => ID)
  id!: string;

  @Field()
  positionTitle!: string;

  @Field(() => String, { nullable: true })
  jobDescription!: string | null;

  @Field(() => Int)
  headcount!: number;

  @Field()
  employmentType!: string;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field(() => String, { nullable: true })
  preferredStartDate!: string | null;

  @Field(() => String, { nullable: true })
  targetFillDate!: string | null;

  @Field(() => Float, { nullable: true })
  salaryMin!: number | null;

  @Field(() => Float, { nullable: true })
  salaryMax!: number | null;

  @Field(() => String, { nullable: true })
  salaryCurrency!: string | null;

  @Field(() => String, { nullable: true })
  hiringManagerEmployeeId!: string | null;

  @Field(() => String, { nullable: true })
  reportsToEmployeeId!: string | null;

  @Field()
  priority!: string;

  @Field(() => String, { nullable: true })
  positionId!: string | null;

  @Field(() => String, { nullable: true })
  clientNote!: string | null;

  // Nulled for client callers: internal notes never cross the portal boundary.
  @Field(() => String, { nullable: true })
  tethrNote!: string | null;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;

  @Field(() => [HiringRequestUpdateView])
  updates!: HiringRequestUpdateView[];
}

// The platform board's row: a request plus the workspace it belongs to. Only
// Tethr operators (kind + platform:read-all) can query these.
@ObjectType('ClientHiringRequest')
export class ClientHiringRequestView extends HiringRequestView {
  @Field(() => ID)
  organizationId!: string;

  @Field()
  organizationName!: string;
}
