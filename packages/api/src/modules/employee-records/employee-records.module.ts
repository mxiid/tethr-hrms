import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { DocumentsModule } from '../../core/documents';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { EmployeeModule } from '../employee';

import { EmployeeCreatedOnboardingConsumer } from './consumers/employee-created-onboarding.consumer';
import { EmployeeRecordsResolver } from './employee-records.resolver';
import { EmployeeRecordsService } from './employee-records.service';
import {
  BANK_DETAIL_CHANGE_REQUEST_REPOSITORY,
  EMPLOYEE_ASSESSMENT_REPOSITORY,
  EMPLOYEE_DOCUMENT_LINK_REPOSITORY,
  EMPLOYEE_HR_RECORD_REPOSITORY,
  EMPLOYEE_ONBOARDING_TASK_REPOSITORY,
} from './employee-records.tokens';
import { BankDetailChangeRequest } from './entities/bank-detail-change-request.entity';
import { EmployeeAssessment } from './entities/employee-assessment.entity';
import { EmployeeDocumentLink } from './entities/employee-document-link.entity';
import { EmployeeHrRecord } from './entities/employee-hr-record.entity';
import { EmployeeOnboardingTask } from './entities/employee-onboarding-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeAssessment,
      EmployeeDocumentLink,
      EmployeeHrRecord,
      EmployeeOnboardingTask,
      BankDetailChangeRequest,
    ]),
    AuthModule,
    AuthzModule,
    DocumentsModule,
    EmployeeModule,
  ],
  providers: [
    EmployeeRecordsService,
    EmployeeRecordsResolver,
    EmployeeCreatedOnboardingConsumer,
    provideTenantScopedRepository(EMPLOYEE_ASSESSMENT_REPOSITORY, EmployeeAssessment),
    provideTenantScopedRepository(EMPLOYEE_DOCUMENT_LINK_REPOSITORY, EmployeeDocumentLink),
    provideTenantScopedRepository(EMPLOYEE_HR_RECORD_REPOSITORY, EmployeeHrRecord),
    provideTenantScopedRepository(EMPLOYEE_ONBOARDING_TASK_REPOSITORY, EmployeeOnboardingTask),
    provideTenantScopedRepository(BANK_DETAIL_CHANGE_REQUEST_REPOSITORY, BankDetailChangeRequest),
  ],
  exports: [EmployeeRecordsService],
})
export class EmployeeRecordsModule {}
