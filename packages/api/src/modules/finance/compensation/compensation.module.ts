import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../../core/auth/auth.module';
import { AuthzModule } from '../../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../../core/tenancy/tenant-repository.provider';
import { EmployeeModule } from '../../employee';

import { EmployeeTerminatedCompensationConsumer } from './compensation.consumer';
import { CompensationResolver } from './compensation.resolver';
import { CompensationService } from './compensation.service';
import { OfferAcceptedCompensationConsumer } from './offer-accepted.consumer';
import {
  PAY_COMPONENT_REPOSITORY,
  BONUS_AWARD_REPOSITORY,
  EMPLOYEE_TAX_PROFILE_REPOSITORY,
  PAY_ADJUSTMENT_REPOSITORY,
  SALARY_REVISION_REPOSITORY,
  SALARY_STRUCTURE_COMPONENT_REPOSITORY,
  SALARY_STRUCTURE_REPOSITORY,
} from './compensation.tokens';
import { BonusAward } from './entities/bonus-award.entity';
import { EmployeeTaxProfile } from './entities/employee-tax-profile.entity';
import { PayAdjustment } from './entities/pay-adjustment.entity';
import { PayComponent } from './entities/pay-component.entity';
import { SalaryRevision } from './entities/salary-revision.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayComponent,
      SalaryStructure,
      SalaryStructureComponent,
      SalaryRevision,
      BonusAward,
      PayAdjustment,
      EmployeeTaxProfile,
    ]),
    AuthModule,
    AuthzModule,
    EmployeeModule,
  ],
  providers: [
    CompensationService,
    CompensationResolver,
    EmployeeTerminatedCompensationConsumer,
    OfferAcceptedCompensationConsumer,
    provideTenantScopedRepository(PAY_COMPONENT_REPOSITORY, PayComponent),
    provideTenantScopedRepository(SALARY_STRUCTURE_REPOSITORY, SalaryStructure),
    provideTenantScopedRepository(SALARY_STRUCTURE_COMPONENT_REPOSITORY, SalaryStructureComponent),
    provideTenantScopedRepository(SALARY_REVISION_REPOSITORY, SalaryRevision),
    provideTenantScopedRepository(BONUS_AWARD_REPOSITORY, BonusAward),
    provideTenantScopedRepository(PAY_ADJUSTMENT_REPOSITORY, PayAdjustment),
    provideTenantScopedRepository(EMPLOYEE_TAX_PROFILE_REPOSITORY, EmployeeTaxProfile),
  ],
  exports: [CompensationService],
})
export class CompensationModule {}
