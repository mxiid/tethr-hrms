import {
  FormDefinitionView,
  FormFieldView,
  PublicFormFieldView,
  PublicFormView,
} from './dto/form.outputs';
import type { FormField } from './entities/form-field.entity';
import type { PublicForm } from './forms.service';

export const toFormFieldView = (field: FormField): FormFieldView => ({
  id: field.id,
  fieldKey: field.fieldKey,
  label: field.label,
  type: field.type,
  required: field.required,
  options: field.options,
  sortOrder: field.sortOrder,
  mapsTo: field.mapsTo,
  helpText: field.helpText,
});

export const toFormDefinitionView = (record: PublicForm): FormDefinitionView => ({
  id: record.form.id,
  name: record.form.name,
  slug: record.form.slug,
  status: record.form.status,
  target: record.form.target,
  createdAt: record.form.createdAt.toISOString(),
  fields: record.fields.map(toFormFieldView),
});

export const toPublicFormFieldView = (field: FormField): PublicFormFieldView => ({
  id: field.id,
  fieldKey: field.fieldKey,
  label: field.label,
  type: field.type,
  required: field.required,
  options: field.options,
  sortOrder: field.sortOrder,
  helpText: field.helpText,
});

export const toPublicFormView = (record: PublicForm): PublicFormView => ({
  id: record.form.id,
  name: record.form.name,
  fields: record.fields.map(toPublicFormFieldView),
});
