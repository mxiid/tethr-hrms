import { JOBS, QUEUES } from '@hrms/shared';
import { Queue } from 'bullmq';

import type { ConfigService } from '../config/config.service';

import { MessageQueueService } from './message-queue.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const buildService = () => {
  const config = {
    get: jest.fn((key: string) => (key === 'REDIS_HOST' ? 'localhost' : 6379)),
  } as unknown as ConfigService;
  return { service: new MessageQueueService(config) };
};

describe('MessageQueueService', () => {
  beforeEach(() => {
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('creates the producer with fail-fast connection options', async () => {
    const { service } = buildService();

    await service.add(QUEUES.default, JOBS.parseCv, {
      organizationId: 'org-1',
      candidateDocumentId: 'doc-1',
    } as never);

    const options = (Queue as unknown as jest.Mock).mock.calls[0][1] as {
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
    // The retry strategy is bounded: it eventually gives up instead of retrying
    // forever while `add` waits.
    expect(options.connection.retryStrategy(1)).toBe(500);
    expect(options.connection.retryStrategy(10)).toBeNull();
    expect(options.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential' },
    });
  });

  it('reuses one queue per name', async () => {
    const { service } = buildService();

    await service.add(QUEUES.default, JOBS.parseCv, {
      organizationId: 'org-1',
      candidateDocumentId: 'doc-1',
    } as never);
    await service.add(QUEUES.default, JOBS.parseCv, {
      organizationId: 'org-1',
      candidateDocumentId: 'doc-2',
    } as never);

    expect(Queue).toHaveBeenCalledTimes(1);
  });
});