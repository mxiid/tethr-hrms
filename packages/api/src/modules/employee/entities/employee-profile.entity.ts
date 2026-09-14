import type {
  AccommodationType,
  EmployeeId,
  PreferredContactChannel,
  UserId,
} from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// Employee-controlled personal/contact data. It is separate from the employment
// record so self-service updates cannot change statutory or employment facts.
@Entity('employee_profiles')
@Index(['organizationId', 'employeeId'], { unique: true })
export class EmployeeProfile extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  // text, not varchar: admin-set photos are stored as data URLs (see
  // UpdateEmployeePhotoInput), which run well past a typical URL length.
  @Column({ type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  personalEmail!: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  addressLine1!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  postalCode!: string | null;

  // Permanent address (Frappe keeps a separate permanent vs current)
  @Column({ type: 'varchar', length: 200, nullable: true })
  permanentAddressLine1!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  permanentAddressLine2!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  permanentCity!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  permanentRegion!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  permanentCountryCode!: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  permanentPostalCode!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currentAccommodationType!: AccommodationType | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  permanentAccommodationType!: AccommodationType | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  preferredContactChannel!: PreferredContactChannel | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  emergencyContactName!: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  emergencyContactPhone!: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  emergencyContactRelation!: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedByUserId!: UserId | null;
}
