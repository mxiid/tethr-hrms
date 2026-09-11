import type { DomainEvent, DomainEventName } from '@hrms/shared';
import { Injectable, Logger } from '@nestjs/common';


type DomainEventHandler = (event: DomainEvent) => Promise<void>;

// In-process publish/subscribe. The relay dispatches outbox events through here
// to consumers registered in the same process. When a module is later extracted
// to its own service, only this transport changes — publishers and consumers
// keep the same DomainEvent contract (plan.md §9).
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<DomainEventName, Set<DomainEventHandler>>();

  register(eventName: DomainEventName, handler: DomainEventHandler): void {
    const handlers = this.handlers.get(eventName) ?? new Set<DomainEventHandler>();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);
    this.logger.debug(`Registered a handler for ${eventName}`);
  }

  // Deliver to every handler. Awaits all; if any handler rejects, dispatch
  // rejects so the relay marks the message for retry. Because consumers are
  // idempotent, re-dispatching an already-handled event is safe.
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.name);
    if (!handlers || handlers.size === 0) {
      return;
    }
    const results = await Promise.allSettled([...handlers].map((handler) => handler(event)));
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        `${failures.length} handler(s) failed for ${event.name}`,
      );
    }
  }
}
