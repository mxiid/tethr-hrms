import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../common/errors';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { LeaveType, type LeaveUnit } from './entities/leave-type.entity';
import { LEAVE_TYPE_REPOSITORY } from './leave.tokens';

type CreateLeaveTypeData = {
  readonly name: string;
  readonly code: string;
  readonly unit?: LeaveUnit;
  readonly paid?: boolean;
  readonly requiresApproval?: boolean;
  readonly defaultAnnualEntitlement?: number;
};

// Manages leave-type configuration (config-as-data). The leave engine reads these;
// it never hard-codes leave categories.
@Injectable()
export class LeaveTypeService {
  constructor(
    @Inject(LEAVE_TYPE_REPOSITORY) private readonly leaveTypes: TenantScopedRepository<LeaveType>,
  ) {}

  create(input: CreateLeaveTypeData): Promise<LeaveType> {
    const leaveType = this.leaveTypes.create({
      name: input.name,
      code: input.code,
      unit: input.unit ?? 'day',
      paid: input.paid ?? true,
      requiresApproval: input.requiresApproval ?? true,
      defaultAnnualEntitlement: (input.defaultAnnualEntitlement ?? 0).toFixed(2),
    });
    return this.leaveTypes.save(leaveType);
  }

  list(): Promise<LeaveType[]> {
    return this.leaveTypes.find();
  }

  async getById(id: string): Promise<LeaveType> {
    const leaveType = await this.leaveTypes.findById(id);
    if (!leaveType) {
      throw new NotFoundError('Leave type not found', { id });
    }
    return leaveType;
  }
}
