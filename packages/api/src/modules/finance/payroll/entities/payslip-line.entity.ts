import type { PayComponentCategory } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// One named amount on a payslip (basic, allowances, deductions). A full copy of
// the run-line component at finalization — the payslip renders from its own lines
// only.
@Entity('payslip_lines')
@Index(['organizationId', 'payslipId'])
export class PayslipLine extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  payslipId!: string;

  @Column({ type: 'varchar', length: 32 })
  componentCode!: string;

  @Column({ type: 'varchar', length: 64 })
  componentName!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: PayComponentCategory;

  @Column({ type: 'boolean' })
  taxable!: boolean;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
