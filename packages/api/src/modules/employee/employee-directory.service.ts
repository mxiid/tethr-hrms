import type { EmployeeId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { In, type FindOptionsWhere } from 'typeorm';

import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { EMPLOYEE_REPOSITORY } from './employee.tokens';
import { Employee } from './entities/employee.entity';

// The published read interface for employee facts (plan.md §5.1). When Leave needs
// an employee's name or manager to route an approval, it calls this — it does NOT
// JOIN into the employees table. The storage behind this interface is private to
// the employee module, which is what keeps the module independently extractable.
@Injectable()
export class EmployeeDirectoryService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: TenantScopedRepository<Employee>,
  ) {}

  getById(employeeId: EmployeeId): Promise<Employee | null> {
    return this.employees.findById(employeeId);
  }

  // Batch variant for list hydration (expense claims, client boards): one query
  // for every id, terminated employees included.
  getByIds(employeeIds: readonly EmployeeId[]): Promise<Employee[]> {
    if (employeeIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.employees.find({
      where: { id: In([...employeeIds]) } as FindOptionsWhere<Employee>,
    });
  }

  async exists(employeeId: EmployeeId): Promise<boolean> {
    return (await this.employees.findById(employeeId)) !== null;
  }

  async getDisplayName(employeeId: EmployeeId): Promise<string | null> {
    const employee = await this.employees.findById(employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : null;
  }

  // Everyone not terminated, in hire-date order. Payroll iterates this to draft a
  // run; the returned entities are read-only facts from this module's private
  // storage — consumers must never persist them elsewhere.
  listActive(): Promise<Employee[]> {
    return this.employees.find({
      where: { employmentStatus: 'active' } as FindOptionsWhere<Employee>,
      order: { hireDate: 'ASC', employeeNumber: 'ASC' },
    });
  }
}
