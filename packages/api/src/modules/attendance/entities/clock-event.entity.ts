import type { EmployeeId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';


type ClockType = 'in' | 'out';
export type ClockSource = 'web' | 'mobile' | 'kiosk' | 'system';

// A raw punch. Pairs of in/out are reduced into TimeEntry rows; the events
// themselves are the immutable record of what happened.
@Entity('clock_events')
@Index(['organizationId', 'employeeId', 'occurredAt'])
export class ClockEvent extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  employeeId!: EmployeeId;

  @Column({ type: 'varchar', length: 8 })
  type!: ClockType;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'web' })
  source!: ClockSource;
}
