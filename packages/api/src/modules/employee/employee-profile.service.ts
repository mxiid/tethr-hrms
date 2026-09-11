import type {
  AccommodationType,
  EmployeeId,
  PreferredContactChannel,
  UserId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { FindOptionsWhere } from 'typeorm';

import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { EMPLOYEE_PROFILE_REPOSITORY } from './employee.tokens';

type UpdateEmployeeProfileData = {
  readonly photoUrl?: string | null;
  readonly personalEmail?: string | null;
  readonly phone?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly countryCode?: string | null;
  readonly postalCode?: string | null;
  readonly permanentAddressLine1?: string | null;
  readonly permanentAddressLine2?: string | null;
  readonly permanentCity?: string | null;
  readonly permanentRegion?: string | null;
  readonly permanentCountryCode?: string | null;
  readonly permanentPostalCode?: string | null;
  readonly currentAccommodationType?: AccommodationType | null;
  readonly permanentAccommodationType?: AccommodationType | null;
  readonly preferredContactChannel?: PreferredContactChannel | null;
  readonly emergencyContactName?: string | null;
  readonly emergencyContactPhone?: string | null;
  readonly emergencyContactRelation?: string | null;
};

@Injectable()
export class EmployeeProfileService {
  constructor(
    @Inject(EMPLOYEE_PROFILE_REPOSITORY)
    private readonly profiles: TenantScopedRepository<EmployeeProfile>,
  ) {}

  getForEmployee(employeeId: EmployeeId): Promise<EmployeeProfile | null> {
    return this.profiles.findOne({ where: { employeeId } as FindOptionsWhere<EmployeeProfile> });
  }

  async updateForEmployee(
    employeeId: EmployeeId,
    updatedByUserId: UserId,
    input: UpdateEmployeeProfileData,
  ): Promise<EmployeeProfile> {
    const existing = await this.getForEmployee(employeeId);
    const profile =
      existing ??
      this.profiles.create({
        employeeId,
        photoUrl: null,
        personalEmail: null,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        countryCode: null,
        postalCode: null,
        permanentAddressLine1: null,
        permanentAddressLine2: null,
        permanentCity: null,
        permanentRegion: null,
        permanentCountryCode: null,
        permanentPostalCode: null,
        currentAccommodationType: null,
        permanentAccommodationType: null,
        preferredContactChannel: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelation: null,
        updatedByUserId,
      });

    for (const [key, value] of Object.entries(input) as [keyof UpdateEmployeeProfileData, unknown][]) {
      if (value !== undefined) {
        (profile as unknown as Record<string, unknown>)[key] = value;
      }
    }
    profile.updatedByUserId = updatedByUserId;
    return this.profiles.save(profile);
  }
}
