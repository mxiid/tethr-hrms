import type { ApprovalStatus, EmployeeId, IsoDate, LeaveTypeId, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A request for time off. Routes through the shared workflow engine for approval
// (`approvalRequestId` references the ApprovalRequest by ID — no cross-module FK).
@Entity('leave_requests')
@Index(['organizationId', 'employeeId'])
@Index(['organizationId', 'status'])
export class LeaveRequest extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'uuid' })
  leaveTypeId!: LeaveTypeId;

  @Column({ type: 'date' })
  startDate!: IsoDate;

  @Column({ type: 'date' })
  endDate!: IsoDate;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  dayCount!: string;

  // The per-calendar-year split of `dayCount` (D2): a request spanning a year
  // boundary reserves/spends each year's balance. Snapshotted at submit so the
  // decision releases exactly what was reserved, even if the holiday calendar
  // changes in between.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  yearAllocations!: readonly { readonly year: number; readonly days: number }[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ApprovalStatus;

  @Column({ type: 'uuid', nullable: true })
  approvalRequestId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId!: UserId | null;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;
}
