import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../../core/auth/auth.module';
import { AuthzModule } from '../../../core/authz/authz.module';
import { PdfModule } from '../../../core/pdf/pdf.module';
import { provideTenantScopedRepository } from '../../../core/tenancy/tenant-repository.provider';
import { CompensationModule } from '../compensation';
import { EmployeeModule } from '../../employee';
import { EmployeeRecordsModule } from '../../employee-records';
import { LeaveModule } from '../../leave';

import { PayrollRunLineComponent } from './entities/payroll-run-line-component.entity';
import { PayrollRunLine } from './entities/payroll-run-line.entity';
import {
  PayrollRun,
} from './entities/payroll-run.entity';
import { PayslipLine } from './entities/payslip-line.entity';
import { Payslip } from './entities/payslip.entity';
import { TaxSlabGroup, TaxSlab } from './entities/tax-slab.entities';
import { PayrollRunService } from './payroll-run.service';
import { PayrollResolver } from './payroll.resolver';
import {
  PAYSLIP_LINE_REPOSITORY,
  PAYSLIP_REPOSITORY,
  PAYROLL_RUN_LINE_COMPONENT_REPOSITORY,
  PAYROLL_RUN_LINE_REPOSITORY,
  PAYROLL_RUN_REPOSITORY,
  TAX_SLAB_GROUP_REPOSITORY,
  TAX_SLAB_REPOSITORY,
} from './payroll.tokens';
import { PayslipPdfService } from './pdf/payslip-pdf.service';
import { TaxSlabService } from './tax-slab.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollRun,
      PayrollRunLine,
      PayrollRunLineComponent,
      Payslip,
      PayslipLine,
      TaxSlabGroup,
      TaxSlab,
    ]),
    AuthModule,
    AuthzModule,
    PdfModule,
    EmployeeModule,
    CompensationModule,
    LeaveModule,
    EmployeeRecordsModule,
  ],
  providers: [
    PayrollRunService,
    PayslipPdfService,
    TaxSlabService,
    PayrollResolver,
    provideTenantScopedRepository(PAYROLL_RUN_REPOSITORY, PayrollRun),
    provideTenantScopedRepository(PAYROLL_RUN_LINE_REPOSITORY, PayrollRunLine),
    provideTenantScopedRepository(PAYROLL_RUN_LINE_COMPONENT_REPOSITORY, PayrollRunLineComponent),
    provideTenantScopedRepository(PAYSLIP_REPOSITORY, Payslip),
    provideTenantScopedRepository(PAYSLIP_LINE_REPOSITORY, PayslipLine),
    provideTenantScopedRepository(TAX_SLAB_GROUP_REPOSITORY, TaxSlabGroup),
    provideTenantScopedRepository(TAX_SLAB_REPOSITORY, TaxSlab),
  ],
  exports: [PayrollRunService, TaxSlabService],
})
export class PayrollModule {}
