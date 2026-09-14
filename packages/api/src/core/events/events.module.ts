import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DomainEventPublisher } from './domain-event-publisher.service';
import { EventBus } from './event-bus.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxMessage } from './outbox-message.entity';
import { OutboxRelayRunner } from './outbox-relay.runner';
import { OutboxRelay } from './outbox-relay.service';
import { ProcessedEvent } from './processed-event.entity';

// Global so any module can publish events and register idempotent consumers
// without re-importing the plumbing.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage, ProcessedEvent])],
  providers: [DomainEventPublisher, EventBus, IdempotencyService, OutboxRelay, OutboxRelayRunner],
  exports: [DomainEventPublisher, EventBus, IdempotencyService, OutboxRelay],
})
export class EventsModule {}
