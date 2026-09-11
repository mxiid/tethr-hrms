import type { CostCenterId, DepartmentId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';

import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { Department } from './entities/department.entity';
import { DEPARTMENT_REPOSITORY } from './organization.tokens';

type CreateDepartmentInput = {
  readonly name: string;
  readonly parentDepartmentId?: DepartmentId | null;
  readonly costCenterId?: CostCenterId | null;
};

@Injectable()
export class DepartmentService {
  constructor(
    @Inject(DEPARTMENT_REPOSITORY)
    private readonly departments: TenantScopedRepository<Department>,
  ) {}

  create(input: CreateDepartmentInput): Promise<Department> {
    const department = this.departments.create({
      name: input.name,
      parentDepartmentId: input.parentDepartmentId ?? null,
      costCenterId: input.costCenterId ?? null,
      headEmployeeId: null,
    });
    return this.departments.save(department);
  }

  list(): Promise<Department[]> {
    return this.departments.find();
  }

  getById(id: string): Promise<Department | null> {
    return this.departments.findById(id);
  }
}
