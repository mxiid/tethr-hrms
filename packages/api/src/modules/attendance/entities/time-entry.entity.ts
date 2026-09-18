import type { EmployeeId, IsoDate } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';


type TimeEntrySource = 'clock' | 'manual' | 'regularization';

// Worked hours attributed to an employee on a calendar day. The unit a timesheet
// sums and (once locked) Payroll consumes.
@Entity('time_entries')
@Index(['organizationId', 'employeeId', 'date'])
@Index(['organizationId', 'employeeId', 'timesheetId'])
export class TimeEntry extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  // Set when the entry's period is locked: the timesheet that froze it. A
  // locked entry can never be moved to another timesheet or edited.
  @Column({ type: 'uuid', nullable: true })
  timesheetId!: string | null;

  @Column({ type: 'date' })
  date!: IsoDate;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  hours!: string;

  @Column({ type: 'varchar', length: 16, default: 'clock' })
  source!: TimeEntrySource;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;
}
