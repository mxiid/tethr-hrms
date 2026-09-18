import type { EmployeeId, IsoDate, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';


type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'locked';

// A period of an employee's time, rolled up from TimeEntry rows. Once `locked`
// it is an immutable input to Payroll (plan.md §5.2: timesheet.locked -> Payroll).
@Entity('timesheets')
@Index(['organizationId', 'employeeId', 'periodStart'], { unique: true })
export class Timesheet extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'date' })
  periodStart!: IsoDate;

  @Column({ type: 'date' })
  periodEnd!: IsoDate;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: TimesheetStatus;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0 })
  totalHours!: string;

  @Column({ type: 'uuid', nullable: true })
  submittedByUserId!: UserId | null;

  @Column({ type: 'uuid', nullable: true })
  approvedByUserId!: UserId | null;
}
