import type { EmployeeId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../../core/database/entities/tenant-scoped.entity';

// Which billing group an employee currently belongs to and the agreed fixed USD
// monthly rate Tethr bills for them. The employee is referenced by ID only
// (non-negotiable #2); hire dates for pro-rating come from the published
// directory at invoice-drafting time.
//
// Deliberate V1 scope: this is the CURRENT membership, not an effective-dated
// history. Catch-up logic derives past entitlements from hire date plus which
// months were already invoiced, so a team move does not double-bill. If real
// membership history becomes load-bearing (mid-month transfers between groups),
// promote this row to TemporalEntity then — the table is private to this module
// so that is a local change.
@Entity('billing_group_members')
@Index('billing_members_org_emp_unique', ['organizationId', 'employeeId'], { unique: true })
@Index('billing_members_org_group_idx', ['organizationId', 'groupId'])
export class BillingGroupMember extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'uuid' })
  groupId!: string;

  // Agreed fixed monthly rate billed to the client for this person.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  monthlyRate!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  rateCurrency!: string;
}

