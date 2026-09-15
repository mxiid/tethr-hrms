import { ArgsType, Field, ID, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

@InputType()
export class ExpenseReceiptInput {
  @Field()
  @IsString()
  @MaxLength(400)
  storageKey!: string;

  @Field()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @Field()
  @IsString()
  @MaxLength(120)
  contentType!: string;

  @Field(() => Number)
  @IsNumber()
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

@InputType()
export class PrepareExpenseReceiptUploadInput {
  @Field()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @Field()
  @IsString()
  @MaxLength(120)
  contentType!: string;
}

@InputType()
export class CreateExpenseCategoryInput {
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  requiresReceipt?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  billableToClient?: boolean;
}

@InputType()
export class UpdateExpenseCategoryInput {
  @Field(() => ID)
  @IsUUID()
  categoryId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  requiresReceipt?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  billableToClient?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  isActive?: boolean;
}

@InputType()
export class CreateExpenseClaimInput {
  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  purpose!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;
}

@InputType()
export class CreateMyExpenseClaimInput {
  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  purpose!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;
}

@InputType()
export class AddExpenseClaimLineInput {
  @Field(() => ID)
  @IsUUID()
  categoryId!: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expenseDate must be an ISO date (YYYY-MM-DD)' })
  expenseDate!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @Field(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @Field(() => ExpenseReceiptInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpenseReceiptInput)
  receipt?: ExpenseReceiptInput | null;
}

@InputType()
export class UpdateExpenseClaimLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expenseDate must be an ISO date (YYYY-MM-DD)' })
  expenseDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @Field(() => ExpenseReceiptInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpenseReceiptInput)
  receipt?: ExpenseReceiptInput | null;
}

@ArgsType()
export class DecideExpenseClaimArgs {
  @Field(() => ID)
  @IsUUID()
  claimId!: string;

  @Field()
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sourceOrganizationId?: string;
}

@ArgsType()
export class MarkExpenseClaimReimbursedArgs {
  @Field(() => ID)
  @IsUUID()
  claimId!: string;

  @Field()
  @IsIn(['direct', 'payroll'])
  method!: 'direct' | 'payroll';

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  componentId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sourceOrganizationId?: string;
}

@ArgsType()
export class BillExpenseClaimArgs {
  @Field(() => ID)
  @IsUUID()
  claimId!: string;

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

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sourceOrganizationId?: string;
}
