import type { DomainEventName } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../database/entities/tenant-scoped.entity';


type OutboxStatus = 'pending' | 'processed' | 'failed';

// The transactional outbox. A state change writes its domain event here in the
// SAME database transaction as the change itself, so the two commit atomically —
// no lost events, no events for changes that rolled back. A relay later delivers
// pending rows to consumers (plan.md §10).
@Entity('outbox_messages')
@Index(['status', 'occurredAt'])
export class OutboxMessage extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 128 })
  eventName!: DomainEventName;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;
}
