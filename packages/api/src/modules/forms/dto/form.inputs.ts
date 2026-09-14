import { FORM_FIELD_TYPES, FORM_TARGETS } from '@hrms/shared';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,63}$/;

@InputType()
export class CreateFormFieldInput {
  @Field()
  @Matches(FIELD_KEY, { message: 'fieldKey must be a camelCase identifier' })
  fieldKey!: string;

  @Field()
  @IsString()
  @MaxLength(200)
  label!: string;

  @Field()
  @IsIn([...FORM_FIELD_TYPES])
  type!: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mapsTo?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;
}

@InputType()
export class CreateFormDefinitionInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...FORM_TARGETS])
  target?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  @Field(() => [CreateFormFieldInput])
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldInput)
  fields!: CreateFormFieldInput[];
}

@InputType()
export class SubmitFormAnswerInput {
  @Field()
  @Matches(FIELD_KEY)
  fieldKey!: string;

  @Field()
  @IsString()
  @MaxLength(20000)
  value!: string;
}

@InputType()
export class SubmitFormFileInput {
  @Field()
  @Matches(FIELD_KEY)
  fieldKey!: string;

  @Field()
  @IsString()
  @MaxLength(512)
  storageKey!: string;

  @Field()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @Field()
  @IsString()
  @MaxLength(128)
  contentType!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;
}

@InputType()
export class SubmitFormInput {
  @Field()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  token!: string;

  @Field(() => [SubmitFormAnswerInput])
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubmitFormAnswerInput)
  answers!: SubmitFormAnswerInput[];

  @Field(() => [SubmitFormFileInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => SubmitFormFileInput)
  files?: SubmitFormFileInput[];
}

@InputType()
export class PrepareFormUploadInput {
  @Field()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  token!: string;

  @Field()
  @Matches(FIELD_KEY)
  fieldKey!: string;

  @Field()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @Field()
  @IsString()
  @MaxLength(128)
  contentType!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;
}

@InputType()
export class FormLinkInput {
  @Field(() => ID)
  @IsString()
  formDefinitionId!: string;
}
