import type { DomainEvent } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { ProcessedEvent } from './processed-event.entity';


// Guarantees a consumer runs its side effect for a given event at most once. The
// unique index on (consumerName, eventId) is the hard guarantee, and the handler
// receives the transaction's EntityManager: its writes share the ledger's
// transaction, so a handler failure rolls back both the marker and the writes,
// and the event is retried cleanly later. Handlers must finish with external
// side effects (email, Slack, enqueue): those cannot join the transaction and
// are therefore at-least-once.
@Injectable()
export class IdempotencyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async runOnce(
    consumerName: string,
    event: DomainEvent,
    handler: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const alreadyProcessed = await manager.findOne(ProcessedEvent, {
        where: { consumerName, eventId: event.eventId },
      });
      if (alreadyProcessed) {
        return;
      }
      await manager.insert(ProcessedEvent, {
        organizationId: event.tenantId,
        consumerName,
        eventId: event.eventId,
        processedAt: new Date(),
      });
      await handler(manager);
    });
  }
}
