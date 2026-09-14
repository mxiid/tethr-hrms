import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BankDetails')
export class BankDetailsView {
  @Field(() => String, { nullable: true })
  bankName!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountTitle!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountNumber!: string | null;

  @Field(() => String, { nullable: true })
  bankIban!: string | null;
}

@ObjectType('BankDetailChangeRequest')
export class BankDetailChangeRequestView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  bankName!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountTitle!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountNumber!: string | null;

  @Field(() => String, { nullable: true })
  bankIban!: string | null;

  @Field()
  status!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  decidedAt!: Date | null;

  @Field(() => String, { nullable: true })
  decisionNote!: string | null;
}
