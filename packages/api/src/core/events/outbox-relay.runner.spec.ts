import type { ConfigService } from '../config/config.service';

import { OutboxRelayRunner } from './outbox-relay.runner';
import type { OutboxRelay } from './outbox-relay.service';

const buildRunner = (options: { intervalMs: number; isTest?: boolean }) => {
  const relay = { relayPendingBatch: jest.fn().mockResolvedValue(0) } as unknown as OutboxRelay;
  const config = {
    get: jest.fn().mockReturnValue(options.intervalMs),
    isTest: options.isTest ?? false,
  } as unknown as ConfigService;
  return { runner: new OutboxRelayRunner(relay, config), relay };
};

describe('OutboxRelayRunner', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('delivers pending messages on each interval tick', async () => {
    jest.useFakeTimers();
    const { runner, relay } = buildRunner({ intervalMs: 1000 });

    runner.onModuleInit();
    await jest.advanceTimersByTimeAsync(3000);

    expect(relay.relayPendingBatch).toHaveBeenCalledTimes(3);
    runner.onModuleDestroy();
  });

  it('does not overlap ticks when a delivery run is slow', async () => {
    jest.useFakeTimers();
    const { runner, relay } = buildRunner({ intervalMs: 1000 });
    (relay.relayPendingBatch as jest.Mock).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return 0;
    });

    runner.onModuleInit();
    await jest.advanceTimersByTimeAsync(3000);
    expect(relay.relayPendingBatch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(relay.relayPendingBatch).toHaveBeenCalledTimes(2);
    runner.onModuleDestroy();
  });

  it('stays off when the interval is zero or the environment is test', () => {
    jest.useFakeTimers();
    const disabled = buildRunner({ intervalMs: 0 });
    disabled.runner.onModuleInit();
    const test = buildRunner({ intervalMs: 1000, isTest: true });
    test.runner.onModuleInit();

    jest.advanceTimersByTime(5000);

    expect(disabled.relay.relayPendingBatch).not.toHaveBeenCalled();
    expect(test.relay.relayPendingBatch).not.toHaveBeenCalled();
    disabled.runner.onModuleDestroy();
    test.runner.onModuleDestroy();
  });

  it('keeps ticking after a failed delivery run', async () => {
    jest.useFakeTimers();
    const { runner, relay } = buildRunner({ intervalMs: 1000 });
    (relay.relayPendingBatch as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    runner.onModuleInit();
    await jest.advanceTimersByTimeAsync(2000);

    expect(relay.relayPendingBatch).toHaveBeenCalledTimes(2);
    runner.onModuleDestroy();
  });
});
