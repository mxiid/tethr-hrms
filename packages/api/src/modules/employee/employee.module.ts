import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../core/auth/auth.module';
import { AuthzModule } from '../../core/authz/authz.module';
import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';
import { AssignmentModule } from '../assignment/assignment.module';
import { OrganizationModule } from '../organization/organization.module';
import { PositionModule } from '../position/position.module';

import { EmployeeDirectoryModule } from './employee-directory.module';
import { EmployeeEducationService } from './employee-education.service';
import { EmployeeExitInterviewService } from './employee-exit-interview.service';
import { EmployeeOffboardingService } from './employee-offboarding.service';
import { EmployeePersonalDetailsService } from './employee-personal-details.service';
import { EmployeeProfileService } from './employee-profile.service';
import { EmployeeSeparationService } from './employee-separation.service';
import { EmployeeWorkHistoryService } from './employee-work-history.service';
import { EmployeeResolver } from './employee.resolver';
import { EmployeeService } from './employee.service';
import {
  EMPLOYEE_EDUCATION_REPOSITORY,
  EMPLOYEE_EXIT_INTERVIEW_REPOSITORY,
  EMPLOYEE_OFFBOARDING_TASK_REPOSITORY,
  EMPLOYEE_PERSONAL_DETAILS_REPOSITORY,
  EMPLOYEE_PROFILE_REPOSITORY,
  EMPLOYEE_SEPARATION_REPOSITORY,
  EMPLOYEE_WORK_HISTORY_REPOSITORY,
} from './employee.tokens';
import { EmployeeEducation } from './entities/employee-education.entity';
import { EmployeeExitInterview } from './entities/employee-exit-interview.entity';
import { EmployeeOffboardingTask } from './entities/employee-offboarding-task.entity';
import { EmployeePersonalDetails } from './entities/employee-personal-details.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { EmployeeSeparation } from './entities/employee-separation.entity';
import { EmployeeWorkHistory } from './entities/employee-work-history.entity';
import { Employee } from './entities/employee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeProfile,
      EmployeePersonalDetails,
      EmployeeEducation,
      EmployeeWorkHistory,
      EmployeeSeparation,
      EmployeeExitInterview,
      EmployeeOffboardingTask,
    ]),
    AuthModule,
    AuthzModule,
    AssignmentModule,
    PositionModule,
    OrganizationModule,
    EmployeeDirectoryModule,
  ],
  providers: [
    EmployeeService,
    EmployeeProfileService,
    EmployeePersonalDetailsService,
    EmployeeEducationService,
    EmployeeWorkHistoryService,
    EmployeeSeparationService,
    EmployeeExitInterviewService,
    EmployeeOffboardingService,
    EmployeeResolver,
    provideTenantScopedRepository(EMPLOYEE_PROFILE_REPOSITORY, EmployeeProfile),
    provideTenantScopedRepository(EMPLOYEE_PERSONAL_DETAILS_REPOSITORY, EmployeePersonalDetails),
    provideTenantScopedRepository(EMPLOYEE_EDUCATION_REPOSITORY, EmployeeEducation),
    provideTenantScopedRepository(EMPLOYEE_WORK_HISTORY_REPOSITORY, EmployeeWorkHistory),
    provideTenantScopedRepository(EMPLOYEE_SEPARATION_REPOSITORY, EmployeeSeparation),
    provideTenantScopedRepository(EMPLOYEE_EXIT_INTERVIEW_REPOSITORY, EmployeeExitInterview),
    provideTenantScopedRepository(EMPLOYEE_OFFBOARDING_TASK_REPOSITORY, EmployeeOffboardingTask),
  ],
  exports: [
    EmployeeService,
    EmployeeDirectoryModule,
    EmployeeProfileService,
    EmployeePersonalDetailsService,
    EmployeeEducationService,
    EmployeeWorkHistoryService,
    EmployeeSeparationService,
    EmployeeExitInterviewService,
    EmployeeOffboardingService,
  ],
})
export class EmployeeModule {}
