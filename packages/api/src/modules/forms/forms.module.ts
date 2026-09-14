import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';

import { FormDefinition } from './entities/form-definition.entity';
import { FormField } from './entities/form-field.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { FormRateLimiter } from './form-rate-limiter';
import { FormsResolver } from './forms.resolver';
import { FormsService } from './forms.service';
import {
  FORM_DEFINITION_REPOSITORY,
  FORM_FIELD_REPOSITORY,
  FORM_SUBMISSION_REPOSITORY,
} from './forms.tokens';
import { PublicFormsResolver } from './public-forms.resolver';

// The generic form engine + its two surfaces (operator and anonymous). The
// application form is its first consumer; the projection into candidates and
// applications is a `form.submitted` consumer in the recruitment module.
@Module({
  imports: [
    TypeOrmModule.forFeature([FormDefinition, FormField, FormSubmission]),
    AuthModule,
    AuthzModule,
  ],
  providers: [
    FormsService,
    FormsResolver,
    PublicFormsResolver,
    FormRateLimiter,
    provideTenantScopedRepository(FORM_DEFINITION_REPOSITORY, FormDefinition),
    provideTenantScopedRepository(FORM_FIELD_REPOSITORY, FormField),
    provideTenantScopedRepository(FORM_SUBMISSION_REPOSITORY, FormSubmission),
  ],
  exports: [FormsService],
})
export class FormsModule {}
