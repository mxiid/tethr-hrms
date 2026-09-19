import { JOBS, QUEUES } from '@hrms/shared';
import { Queue } from 'bullmq';

import type { ConfigService } from '../config/config.service';

import { MessageQueueService } from './message-queue.service';

const QUEUE_READY_TIMEOUT_MS = 5_000;

const buildQueue = () => ({
  add: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  waitUntilReady: jest.fn().mockResolvedValue(undefined),
});

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
  })),
}));

const QueueMock = Queue as unknown as jest.Mock;

const buildService = () => {
  const config = {
    get: jest.fn((key: string) => (key === 'REDIS_HOST' ? 'localhost' : 6379)),
  } as unknown as ConfigService;
  return { service: new MessageQueueService(config) };
};

const addParseCv = (service: MessageQueueService) =>
  service.add(QUEUES.default, JOBS.parseCv, {
    organizationId: 'org-1',
    candidateDocumentId: 'doc-1',
  } as never);

describe('MessageQueueService', () => {
  beforeEach(() => {
    QueueMock.mockClear();
  });

  it('creates the producer with fail-fast connection options', async () => {
    const { service } = buildService();

    await addParseCv(service);

    const options = QueueMock.mock.calls[0][1] as {
      connection: {
        enableOfflineQueue: boolean;
        maxRetriesPerRequest: number;
        connectTimeout: number;
        retryStrategy: (times: number) => number | null;
      };
      defaultJobOptions: { attempts: number; backoff: { type: string } };
    };
    expect(options.connection).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });
    // The retry strategy never gives up: it caps the delay so the cached queue
    // keeps reconnecting after Redis returns.
    expect(options.connection.retryStrategy(1)).toBe(500);
    expect(options.connection.retryStrategy(10)).toBe(2_000);
    expect(options.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential' },
    });
  });

  it('reuses one queue per name', async () => {
    const { service } = buildService();

    await addParseCv(service);
    await service.add(QUEUES.default, JOBS.parseCv, {
      organizationId: 'org-1',
      candidateDocumentId: 'doc-2',
    } as never);

    expect(QueueMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a missing Redis instead of hanging the caller', async () => {
    const queue = buildQueue();
    queue.waitUntilReady.mockRejectedValueOnce(new Error('Redis is not reachable'));
    QueueMock.mockImplementationOnce(() => queue);
    const { service } = buildService();

    await expect(addParseCv(service)).rejects.toThrow('Redis is not reachable');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects once the bounded readiness wait elapses', async () => {
    jest.useFakeTimers();
    try {
      const queue = buildQueue();
      queue.waitUntilReady.mockImplementationOnce(() => new Promise(() => undefined));
      QueueMock.mockImplementationOnce(() => queue);
      const { service } = buildService();

      const pending = addParseCv(service);
      const assertion = expect(pending).rejects.toThrow('Redis is not reachable');
      await jest.advanceTimersByTimeAsync(QUEUE_READY_TIMEOUT_MS);

      await assertion;
      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
