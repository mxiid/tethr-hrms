import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BillingGroup')
export class BillingGroupView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  servicesPrefix!: string;

  @Field()
  expensesPrefix!: string;

  // Populated by the resolver for list views.
  @Field(() => Number, { nullable: true })
  memberCount?: number;
}

@ObjectType('BillingMember')
export class BillingMemberView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  employeeId!: string;

  @Field(() => String, { nullable: true })
  displayName!: string | null;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String, { nullable: true })
  groupName?: string | null;

  @Field(() => Number)
  monthlyRate!: number;

  @Field()
  rateCurrency!: string;
}

@ObjectType('ClientBillingConfig')
export class ClientBillingConfigView {
  @Field(() => ID)
  id!: string;

  @Field(() => Number)
  feeAmount!: number;

  @Field()
  feeCurrency!: string;

  @Field(() => Number)
  paymentTermsNetDays!: number;

  @Field(() => Number)
  anchorDay!: number;

  @Field(() => String, { nullable: true })
  receiverName!: string | null;

  @Field(() => String, { nullable: true })
  receiverAddress!: string | null;

  @Field(() => String, { nullable: true })
  receiverEmail!: string | null;

  @Field(() => String, { nullable: true })
  receiverZipCode!: string | null;

  @Field(() => String, { nullable: true })
  receiverCity!: string | null;

  @Field(() => String, { nullable: true })
  receiverCountry!: string | null;

  @Field(() => String, { nullable: true })
  senderZipCode!: string | null;

  @Field(() => String, { nullable: true })
  senderCity!: string | null;

  @Field(() => String, { nullable: true })
  senderCountry!: string | null;

  @Field(() => String, { nullable: true })
  invoiceLogoDataUrl!: string | null;

  @Field(() => String, { nullable: true })
  signatureDataUrl!: string | null;

  @Field(() => String, { nullable: true })
  senderName!: string | null;

  @Field(() => String, { nullable: true })
  senderEmail!: string | null;

  @Field(() => String, { nullable: true })
  bankName!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountName!: string | null;

  @Field(() => String, { nullable: true })
  bankAccountNumber!: string | null;

  @Field(() => String, { nullable: true })
  bankSwift!: string | null;
}

