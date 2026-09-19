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
  private readonly handlers = new Map<DomainEventName, Map<string, DomainEventHandler>>();

  // Consumers are keyed by name, so re-registering the same consumer replaces
  // its handler instead of stacking a second copy of it.
  register(eventName: DomainEventName, consumerName: string, handler: DomainEventHandler): void {
    const handlers = this.handlers.get(eventName) ?? new Map<string, DomainEventHandler>();
    handlers.set(consumerName, handler);
    this.handlers.set(eventName, handlers);
    this.logger.debug(`Registered consumer ${consumerName} for ${eventName}`);
  }

  // Deliver to every registered consumer. Consumers run one at a time, each in
  // its own try/catch: one failure never prevents the rest from running, and
  // every outcome is logged with the consumer's name. If any consumer failed
  // the dispatch rejects so the relay keeps the message and retries it;
  // consumers that already recorded themselves in the idempotency ledger are
  // skipped on that retry, so only the failed consumers run again.
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.name);
    if (!handlers || handlers.size === 0) {
      return;
    }
    const failures: string[] = [];
    const errors: unknown[] = [];
    for (const [consumerName, handler] of handlers) {
      try {
        await handler(event);
        this.logger.debug(`Consumer ${consumerName} handled ${event.name}`);
      } catch (error) {
        failures.push(consumerName);
        errors.push(error);
        this.logger.error(
          `Consumer ${consumerName} failed for ${event.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `${failures.length}/${handlers.size} consumer(s) failed for ${event.name}: ${failures.join(', ')}`,
      );
    }
  }
}
