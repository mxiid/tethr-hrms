import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('FormField')
export class FormFieldView {
  @Field(() => ID)
  id!: string;

  @Field()
  fieldKey!: string;

  @Field()
  label!: string;

  @Field()
  type!: string;

  @Field()
  required!: boolean;

  @Field(() => [String])
  options!: string[];

  @Field(() => Int)
  sortOrder!: number;

  @Field(() => String, { nullable: true })
  mapsTo!: string | null;

  @Field(() => String, { nullable: true })
  helpText!: string | null;
}

@ObjectType('FormDefinition')
export class FormDefinitionView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;

  @Field()
  status!: string;

  @Field()
  target!: string;

  @Field()
  createdAt!: string;

  @Field(() => [FormFieldView])
  fields!: FormFieldView[];
}

// What the anonymous page renders. Deliberately a narrower field type than the
// builder's: no slug, status, target or `mapsTo` projection targets leak.
@ObjectType('PublicFormField')
export class PublicFormFieldView {
  @Field(() => ID)
  id!: string;

  @Field()
  fieldKey!: string;

  @Field()
  label!: string;

  @Field()
  type!: string;

  @Field()
  required!: boolean;

  @Field(() => [String])
  options!: string[];

  @Field(() => Int)
  sortOrder!: number;

  @Field(() => String, { nullable: true })
  helpText!: string | null;
}

@ObjectType('PublicForm')
export class PublicFormView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => [PublicFormFieldView])
  fields!: PublicFormFieldView[];
}

@ObjectType('FormLink')
export class FormLinkView {
  @Field(() => ID)
  formDefinitionId!: string;

  @Field()
  token!: string;

  @Field()
  path!: string;
}

@ObjectType('FormUpload')
export class FormUploadView {
  @Field()
  storageKey!: string;

  @Field()
  url!: string;

  @Field()
  method!: string;

  @Field()
  expiresAt!: string;

  @Field(() => [FormUploadHeaderView])
  headers!: FormUploadHeaderView[];
}

@ObjectType('FormUploadHeader')
export class FormUploadHeaderView {
  @Field()
  name!: string;

  @Field()
  value!: string;
}

@ObjectType('FormSubmissionReceipt')
export class FormSubmissionReceiptView {
  @Field(() => ID)
  id!: string;

  @Field()
  submittedAt!: string;
}
