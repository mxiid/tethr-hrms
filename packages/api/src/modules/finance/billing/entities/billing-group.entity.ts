import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// A partition of the client's people for billing purposes (e.g. PowerTech,
// SynAck): each group produces its own Services + Expenses invoice pair with
// its own number prefixes. All of them bill to the same payer — the tenant.
@Entity('billing_groups')
@Index('billing_groups_org_name_unique', ['organizationId', 'name'], { unique: true })
export class BillingGroup extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 8, default: 'SP' })
  servicesPrefix!: string;

  @Column({ type: 'varchar', length: 8, default: 'EP' })
  expensesPrefix!: string;
}
