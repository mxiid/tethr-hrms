import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../../core/auth/auth.module';
import { AuthzModule } from '../../../core/authz/authz.module';
import { PdfModule } from '../../../core/pdf/pdf.module';
import { provideTenantScopedRepository } from '../../../core/tenancy/tenant-repository.provider';
import { EmployeeModule } from '../../employee';
import { PayrollModule } from '../payroll';

import { PayrollFinalizedBillingConsumer } from './billing.consumer';
import { BillingResolver } from './billing.resolver';
import {
  BILLING_GROUP_MEMBER_REPOSITORY,
  BILLING_GROUP_REPOSITORY,
  CLIENT_BILLING_CONFIG_REPOSITORY,
  INVOICE_LINE_REPOSITORY,
  INVOICE_REPOSITORY,
} from './billing.tokens';
import { BillingGroupMember } from './entities/billing-group-member.entity';
import { BillingGroup } from './entities/billing-group.entity';
import { ClientBillingConfig } from './entities/client-billing-config.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './pdf/invoice-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientBillingConfig,
      BillingGroup,
      BillingGroupMember,
      Invoice,
      InvoiceLine,
    ]),
    AuthModule,
    AuthzModule,
    PdfModule,
    EmployeeModule,
    // Published interface only: the finalized-run summary the auto-drafter reads.
    PayrollModule,
  ],
  providers: [
    InvoiceService,
    InvoicePdfService,
    PayrollFinalizedBillingConsumer,
    BillingResolver,
    provideTenantScopedRepository(CLIENT_BILLING_CONFIG_REPOSITORY, ClientBillingConfig),
    provideTenantScopedRepository(BILLING_GROUP_REPOSITORY, BillingGroup),
    provideTenantScopedRepository(BILLING_GROUP_MEMBER_REPOSITORY, BillingGroupMember),
    provideTenantScopedRepository(INVOICE_REPOSITORY, Invoice),
    provideTenantScopedRepository(INVOICE_LINE_REPOSITORY, InvoiceLine),
  ],
  exports: [InvoiceService],
})
export class BillingModule {}
