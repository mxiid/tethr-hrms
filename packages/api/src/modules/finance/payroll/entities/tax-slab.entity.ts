import type { TaxSlabGroupId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// A named set of progressive withholding bands for one financial year
// (config-as-data — non-negotiable #5). Exactly one group is active per tenant;
// the payroll engine resolves the active group at draft time.
@Entity('tax_slab_groups')
@Index(['organizationId', 'name'], { unique: true })
export class TaxSlabGroup extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  financialYearLabel!: string;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency!: string;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;
}

// One band of a group's ladder. upperBound null = the open top band. flatAdditive
// carries the accumulated tax of all lower bands so a single row computes a band.
@Entity('tax_slabs')
@Index(['organizationId', 'groupId'])
export class TaxSlab extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  groupId!: TaxSlabGroupId;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  upperBound!: string | null;

  @Column({ type: 'numeric', precision: 7, scale: 4 })
  ratePercent!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  flatAdditive!: string;
}
