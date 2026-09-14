import { type FormId } from '@hrms/shared';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';

import { FormTokenService } from '../../core/auth/form-token.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';

import {
  PrepareFormUploadInput,
  SubmitFormInput,
} from './dto/form.inputs';
import {
  FormSubmissionReceiptView,
  FormUploadView,
  PublicFormView,
} from './dto/form.outputs';
import { toPublicFormView } from './form.mappers';
import { FormsService } from './forms.service';

type GraphqlContext = {
  readonly req?: {
    readonly ip?: string;
    readonly socket?: { readonly remoteAddress?: string };
  };
};

const clientAddress = (context: GraphqlContext): string =>
  context.req?.ip ?? context.req?.socket?.remoteAddress ?? 'unknown';

// The anonymous surface. Deliberately unguarded (no session exists) but never
// trusting the caller: every operation verifies the signed form-link token
// first and then runs inside the link's tenant, like a session would. The
// signed token is the entire authorization story here.
@Resolver()
export class PublicFormsResolver {
  constructor(
    private readonly forms: FormsService,
    private readonly formTokens: FormTokenService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Query(() => PublicFormView)
  async formByLink(@Args('token') token: string): Promise<PublicFormView> {
    return this.runInLink(token, async (link) =>
      toPublicFormView(await this.forms.getPublicForm(link.formId)),
    );
  }

  @Mutation(() => FormUploadView)
  async prepareFormFileUpload(
    @Args('input') input: PrepareFormUploadInput,
    @Context() context: GraphqlContext,
  ): Promise<FormUploadView> {
    return this.runInLink(input.token, async (link) => {
      const upload = await this.forms.prepareFileUpload({
        formId: link.formId,
        fieldKey: input.fieldKey,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        rateLimitKey: `form-upload:${link.formId}:${clientAddress(context)}`,
      });
      return {
        storageKey: upload.storageKey,
        url: upload.url,
        method: upload.method,
        expiresAt: upload.expiresAt.toISOString(),
        headers: upload.headers.map((header) => ({ name: header.name, value: header.value })),
      };
    });
  }

  @Mutation(() => FormSubmissionReceiptView)
  async submitForm(
    @Args('input') input: SubmitFormInput,
    @Context() context: GraphqlContext,
  ): Promise<FormSubmissionReceiptView> {
    return this.runInLink(input.token, async (link) => {
      const submission = await this.forms.submitForm({
        formId: link.formId,
        data: {
          answers: Object.fromEntries(
            input.answers.map((answer) => [answer.fieldKey, answer.value]),
          ),
          files: (input.files ?? []).map((file) => ({
            fieldKey: file.fieldKey,
            storageKey: file.storageKey,
            fileName: file.fileName,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          })),
          // `refId` is the link's context (e.g. the posting applied for); the
          // projection consumer reads it back from here.
          metadata: {
            ip: clientAddress(context),
            ...(link.refId ? { refId: link.refId } : {}),
          },
        },
        rateLimitKey: `form-submit:${link.formId}:${clientAddress(context)}`,
      });
      return { id: submission.id, submittedAt: submission.submittedAt.toISOString() };
    });
  }

  private runInLink<TResult>(
    token: string,
    work: (link: { readonly formId: FormId; readonly refId: string | null }) => Promise<TResult>,
  ): Promise<TResult> {
    const claims = this.formTokens.verify(token);
    return this.tenantContext.run(
      { organizationId: claims.organizationId, userId: null },
      () => work({ formId: claims.formId, refId: claims.refId }),
    );
  }
}
