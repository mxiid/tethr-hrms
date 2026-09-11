import type { PayComponentId, SalaryStructureId, StructureComponentCalcType } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// How a salary structure splits gross pay into named components (basic,
// allowances, reimbursements). Config-as-data (non-negotiable #5): payroll reads
// this composition through the published compensation interface — it never
// hard-codes "basic is 60%". `percentOfGross` values across one structure must
// not exceed 100; `fixedMonthly` amounts sit on top of the net calculation
// (e.g. fuel reimbursement) or subtract from it when the component is a
// deduction. The component itself stays an ID reference — same-module read for
// display facts is allowed; cross-module storage never happens.
@Entity('salary_structure_components')
@Index(['organizationId', 'structureId'])
export class SalaryStructureComponent extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  structureId!: SalaryStructureId;

  @Column({ type: 'uuid' })
  componentId!: PayComponentId;

  @Column({ type: 'varchar', length: 24 })
  calcType!: StructureComponentCalcType;

  // numeric-as-string. Percent of period gross (0 < v <= 100) or a fixed monthly
  // amount — interpretation comes from calcType, never from magnitude.
  @Column({ type: 'numeric', precision: 14, scale: 4 })
  value!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
