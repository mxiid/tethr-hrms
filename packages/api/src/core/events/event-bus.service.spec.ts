import { toId, type EmployeeId, type OrganizationId, type DomainEvent } from '@hrms/shared';

import { EventBus } from './event-bus.service';

const ORG = toId<OrganizationId>('org-1');

const makeEvent = (): DomainEvent<'employee.created'> => ({
  eventId: 'evt-1',
  name: 'employee.created',
  payload: { employeeId: toId<EmployeeId>('emp-1') },
  tenantId: ORG,
  occurredAt: '2026-06-18T00:00:00.000Z',
  version: 1,
});

describe('EventBus', () => {
  it('delivers an event to every registered consumer', async () => {
    const bus = new EventBus();
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    bus.register('employee.created', 'consumer.first', first);
    bus.register('employee.created', 'consumer.second', second);

    const event = makeEvent();
    await bus.dispatch(event);

    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
  });

  it('re-registering a consumer replaces its handler instead of stacking it', async () => {
    const bus = new EventBus();
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    bus.register('employee.created', 'consumer.first', first);
    bus.register('employee.created', 'consumer.first', second);

    await bus.dispatch(makeEvent());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('resolves quietly when no consumer is registered', async () => {
    const bus = new EventBus();
    await expect(bus.dispatch(makeEvent())).resolves.toBeUndefined();
  });

  it('runs every consumer when one fails and names the failure', async () => {
    const bus = new EventBus();
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const succeeding = jest.fn().mockResolvedValue(undefined);
    bus.register('employee.created', 'consumer.failing', failing);
    bus.register('employee.created', 'consumer.succeeding', succeeding);

    const error = await bus
      .dispatch(makeEvent())
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as AggregateError);

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error?.message).toContain('consumer.failing');
    expect(error?.errors).toHaveLength(1);
  });

  it('skips a consumer the ledger already recorded when the event is redelivered', async () => {
    const bus = new EventBus();
    const recorded = new Set<string>();
    // Mirrors IdempotencyService.runOnce: a consumer is recorded only when its
    // handler succeeds, so a failed consumer runs again on redelivery.
    const runOnce = async (
      consumerName: string,
      event: DomainEvent,
      handler: () => Promise<void>,
    ): Promise<void> => {
      const key = `${consumerName}:${event.eventId}`;
      if (recorded.has(key)) {
        return;
      }
      await handler();
      recorded.add(key);
    };
    const failing = jest.fn().mockRejectedValue(new Error('flaky'));
    const succeeding = jest.fn().mockResolvedValue(undefined);
    bus.register('employee.created', 'consumer.failing', (event) =>
      runOnce('consumer.failing', event, failing),
    );
    bus.register('employee.created', 'consumer.succeeding', (event) =>
      runOnce('consumer.succeeding', event, succeeding),
    );

    const event = makeEvent();
    await expect(bus.dispatch(event)).rejects.toBeInstanceOf(AggregateError);
    await expect(bus.dispatch(event)).rejects.toBeInstanceOf(AggregateError);

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
