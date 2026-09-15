import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { DocumentsModule } from '../../core/documents/documents.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { WorkflowModule } from '../../core/workflow/workflow.module';
import { EmployeeModule } from '../employee';
import { BillingModule } from '../finance/billing/billing.module';
import { CompensationModule } from '../finance/compensation/compensation.module';
import { OrganizationModule } from '../organization/organization.module';

import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaimLine } from './entities/expense-claim-line.entity';
import { ExpenseClaim } from './entities/expense-claim.entity';
import { ExpenseClaimService } from './expense-claim.service';
import { ExpensesResolver } from './expenses.resolver';
import {
  EXPENSE_CATEGORY_REPOSITORY,
  EXPENSE_CLAIM_LINE_REPOSITORY,
  EXPENSE_CLAIM_REPOSITORY,
} from './expenses.tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseCategory, ExpenseClaim, ExpenseClaimLine]),
    AuthModule,
    AuthzModule,
    DocumentsModule,
    WorkflowModule,
    EmployeeModule,
    OrganizationModule,
    // Published interfaces only: payroll adjustments for reimbursement and the
    // billing pass-through for client-billable lines.
    CompensationModule,
    BillingModule,
  ],
  providers: [
    ExpenseClaimService,
    ExpensesResolver,
    provideTenantScopedRepository(EXPENSE_CATEGORY_REPOSITORY, ExpenseCategory),
    provideTenantScopedRepository(EXPENSE_CLAIM_REPOSITORY, ExpenseClaim),
    provideTenantScopedRepository(EXPENSE_CLAIM_LINE_REPOSITORY, ExpenseClaimLine),
  ],
  exports: [ExpenseClaimService],
})
export class ExpensesModule {}
