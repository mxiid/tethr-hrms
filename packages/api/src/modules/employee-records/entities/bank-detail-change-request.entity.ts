import type { EmployeeId, UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

type BankDetailChangeStatus = 'pending' | 'approved' | 'rejected';

// A payment-instruction change request rather than a direct edit: the employee
// proposes new bank details, HR approves, and only then are the HR record's bank
// fields updated. Keeps an auditable trail and stops a compromised login
// silently redirecting someone's pay.
@Entity('bank_detail_change_requests')
@Index(['organizationId', 'employeeId'])
@Index(['organizationId', 'status'])
export class BankDetailChangeRequest extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bankName!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bankAccountTitle!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  bankAccountNumber!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  bankIban!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: BankDetailChangeStatus;

  // The generic approval this request rides on (WorkflowService), so the
  // decision trail is unified rather than a second bespoke approval mechanism.
  @Column({ type: 'uuid', nullable: true })
  approvalRequestId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestedByUserId!: UserId | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId!: UserId | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  decisionNote!: string | null;
}
