import type { EmployeeId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TemporalEntity } from '../../../../core/database/entities/temporal.entity';

// Effective-dated membership: which billing group an employee belonged to and the
// agreed fixed USD monthly rate for that span. Rows are never overwritten — a
// group/rate change closes the open row and opens the next, and a termination
// closes it at the termination date (so a departed employee stops being billed
// the following month, and a partial final month is billed pro-rata). Employee
// and group are ID references only (non-negotiable #2); hire/termination dates
// come through the published directory.
@Entity('billing_group_members')
@Index(['organizationId', 'employeeId', 'validFrom'])
@Index('billing_members_org_group_idx', ['organizationId', 'groupId'])
// At most one OPEN membership per employee. The effective-dating move dropped
// the old (org, employee) unique index; this partial unique index replaces it
// and closes the concurrent-setMember race at the database level.
@Index('billing_members_org_emp_open_unique', ['organizationId', 'employeeId'], {
  unique: true,
  where: '"validTo" IS NULL',
})
export class BillingGroupMember extends TemporalEntity {
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

