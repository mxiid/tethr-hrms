import { ArgsType, Field, ID, InputType } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateBillingConfigInput {
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  paymentTermsNetDays?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(28)
  anchorDay?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverAddress?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverEmail?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverZipCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverCity?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverCountry?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  receiverPhone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderZipCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderCity?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderCountry?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderPhone?: string | null;

  // Data URLs (base64) — capped well above a 300 KB image.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(600_000)
  invoiceLogoDataUrl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(600_000)
  signatureDataUrl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderAddress?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  senderEmail?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bankName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bankAccountName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bankSwift?: string | null;
}

@InputType()
export class CreateBillingGroupInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  servicesPrefix!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  expensesPrefix!: string;
}

@InputType()
export class SetBillingMemberInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID)
  @IsUUID()
  groupId!: string;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRate!: number;
}

// Finance opens a manual pass-through document per group and month.
@ArgsType()
export class OpenExpensesInvoiceArgs {
  @Field(() => ID)
  @IsUUID()
  groupId!: string;

  @Field(() => Number)
  @IsNumber()
  @IsInt()
  @Min(2000)
  @Max(2100)
  serviceYear!: number;

  @Field(() => Number)
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(12)
  serviceMonth!: number;
}

@InputType()
export class AddInvoiceLineInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['salary', 'fee', 'expense', 'catchup'])
  kind?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  monthLabel?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

@InputType()
export class UpdateInvoiceLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

@ArgsType()
export class MarkInvoicePaidArgs {
  @Field(() => ID)
  @IsUUID()
  invoiceId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;
}


