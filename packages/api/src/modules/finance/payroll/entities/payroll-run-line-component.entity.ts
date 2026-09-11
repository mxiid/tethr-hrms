import type { PayComponentCategory } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// The component breakdown of one run line, snapshotted when the line was drafted
// so finalize always reproduces exactly what finance reviewed — even if the
// structure composition or component config changes in between. Component facts
// (code, name, category, taxable) are copies by design: this is the boundary
// where live compensation config becomes run history.
@Entity('payroll_run_line_components')
@Index(['organizationId', 'lineId'])
export class PayrollRunLineComponent extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  lineId!: string;

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
