import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

// The photo is uploaded on its own via `updateMyEmployeePhoto` (a data URL) —
// it is deliberately NOT part of the profile form payload.
@InputType()
export class UpdateMyProfileInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  personalEmail?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  phone?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  region?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  postalCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  permanentAddressLine1?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  permanentAddressLine2?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  permanentCity?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  permanentRegion?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  permanentCountryCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  permanentPostalCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['rented', 'owned'])
  currentAccommodationType?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['rented', 'owned'])
  permanentAccommodationType?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['companyEmail', 'personalEmail', 'userId'])
  preferredContactChannel?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  emergencyContactPhone?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  emergencyContactRelation?: string;
}
