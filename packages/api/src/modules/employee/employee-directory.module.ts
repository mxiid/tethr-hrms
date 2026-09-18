import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { provideTenantScopedRepository } from '../../core/tenancy/tenant-repository.provider';

import { EmployeeDirectoryService } from './employee-directory.service';
import { EMPLOYEE_REPOSITORY } from './employee.tokens';
import { Employee } from './entities/employee.entity';

// The published read interface for employee facts (plan.md §5.1), split into its
// own module so consumers the employee module itself depends on (assignment) can
// read the directory without importing EmployeeModule and closing a cycle. The
// storage stays private to the employee module family.
@Module({
  imports: [TypeOrmModule.forFeature([Employee])],
  providers: [
    EmployeeDirectoryService,
    provideTenantScopedRepository(EMPLOYEE_REPOSITORY, Employee),
  ],
  exports: [EmployeeDirectoryService, EMPLOYEE_REPOSITORY],
})
export class EmployeeDirectoryModule {}
