import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { EmployeeModule } from '../employee';

import { BenefitService } from './benefit.service';
import { EmployeeTerminatedBenefitsConsumer } from './benefits.consumer';
import { BenefitsResolver } from './benefits.resolver';
import { BENEFIT_ENROLLMENT_REPOSITORY, BENEFIT_PLAN_REPOSITORY } from './benefits.tokens';
import { BenefitEnrollment } from './entities/benefit-enrollment.entity';
import { BenefitPlan } from './entities/benefit-plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BenefitPlan, BenefitEnrollment]),
    AuthModule,
    AuthzModule,
    EmployeeModule,
  ],
  providers: [
    BenefitService,
    BenefitsResolver,
    EmployeeTerminatedBenefitsConsumer,
    provideTenantScopedRepository(BENEFIT_PLAN_REPOSITORY, BenefitPlan),
    provideTenantScopedRepository(BENEFIT_ENROLLMENT_REPOSITORY, BenefitEnrollment),
  ],
  exports: [BenefitService],
})
export class BenefitsModule {}
