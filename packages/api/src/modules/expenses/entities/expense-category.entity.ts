import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// Tenant-configurable expense vocabulary. Claims reference a category so
// finance controls what can be claimed, whether a receipt is mandatory, and
// whether the spend is recoverable from the client (which feeds the billing
// pass-through on the expenses invoice).
@Entity('expense_categories')
@Index('expense_categories_org_code_unique', ['organizationId', 'code'], { unique: true })
export class ExpenseCategory extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: false })
  requiresReceipt!: boolean;

  @Column({ type: 'boolean', default: false })
  billableToClient!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
