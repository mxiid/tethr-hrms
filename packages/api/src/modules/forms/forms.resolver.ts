import { toId, type FormFieldType, type FormId, type OrganizationId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { FormTokenService } from '../../core/auth/form-token.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { PermissionsGuard } from '../../core/authz/permissions.guard';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import { CreateFormDefinitionInput, FormLinkInput } from './dto/form.inputs';
import { FormDefinitionView, FormLinkView } from './dto/form.outputs';
import { toFormDefinitionView } from './form.mappers';
import { FormsService } from './forms.service';

// The builder's operator surface (Tethr-side). Publishing mints the signed
// public link the applicant opens; the anonymous surface lives in
// PublicFormsResolver.
@Resolver(() => FormDefinitionView)
export class FormsResolver {
  constructor(
    private readonly forms: FormsService,
    private readonly formTokens: FormTokenService,
  ) {}

  @Query(() => [FormDefinitionView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.formManage)
  async formDefinitions(): Promise<FormDefinitionView[]> {
    return (await this.forms.listForms()).map(toFormDefinitionView);
  }

  @Mutation(() => FormDefinitionView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.formManage)
  async createFormDefinition(
    @Args('input') input: CreateFormDefinitionInput,
  ): Promise<FormDefinitionView> {
    const record = await this.forms.createForm({
      name: input.name,
      slug: input.slug,
      target: input.target as 'generic' | 'application' | undefined,
      status: input.status as 'draft' | 'published' | undefined,
      fields: input.fields.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type as FormFieldType,
        required: field.required ?? false,
        options: field.options ?? [],
        mapsTo: field.mapsTo ?? null,
        helpText: field.helpText ?? null,
      })),
    });
    return toFormDefinitionView(record);
  }

  // Seeds the standard application form (the form builder's first consumer) in
  // the caller's workspace; idempotent, so a posting can call it every time.
  @Mutation(() => FormDefinitionView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.formManage)
  async ensureApplicationFormDefinition(): Promise<FormDefinitionView> {
    return toFormDefinitionView(await this.forms.ensureApplicationForm());
  }

  @Mutation(() => FormLinkView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.formManage)
  async createFormLink(@Args('input') input: FormLinkInput): Promise<FormLinkView> {
    const record = await this.forms.getPublicForm(toId<FormId>(input.formDefinitionId));
    const token = this.formTokens.mint({
      formId: toId<FormId>(record.form.id),
      organizationId: toId<OrganizationId>(record.form.organizationId),
    });
    return {
      formDefinitionId: record.form.id,
      token,
      path: `/apply/${token}`,
    };
  }
}
