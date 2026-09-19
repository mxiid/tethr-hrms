import type { EmployeeId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../common/errors';
import { EmployeeDirectoryService } from '../employee/employee-directory.service';

// Rejects an employee link that does not resolve inside the caller's tenant.
// The directory read is tenant-scoped (TenantScopedRepository), so an id from
// another workspace resolves to null and surfaces as a 404 — an account can
// never be linked to another tenant's employee (TET-216). Checked on both
// create and update for `employee`-portal accounts.
@Injectable()
export class EmployeeLinkGuard {
  constructor(private readonly employees: EmployeeDirectoryService) {}

  async assertEmployeeInTenant(employeeId: string): Promise<void> {
    const employee = await this.employees.getById(employeeId as EmployeeId);
    if (!employee) {
      throw new NotFoundError('Employee not found in this workspace', { employeeId });
    }
  }
}
