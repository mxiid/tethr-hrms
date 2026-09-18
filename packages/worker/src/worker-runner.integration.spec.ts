import { Queue, QueueEvents, Worker, type ConnectionOptions } from 'bullmq';

import { route } from './worker-runner';

// Real-Redis round trip, skipped unless REDIS_INTEGRATION=1 so the default
// suite stays infrastructure-free:
//   REDIS_INTEGRATION=1 npm test -w @hrms/worker
const describeIntegration = process.env.REDIS_INTEGRATION === '1' ? describe : describe.skip;

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};

describeIntegration('worker retries (Redis integration)', () => {
  const queueName = `hrms-worker-integration-${process.pid}-${Date.now()}`;
  let queue: Queue;
  let queueEvents: QueueEvents;
  let worker: Worker | null = null;

  beforeEach(async () => {
    queue = new Queue(queueName, { connection });
    queueEvents = new QueueEvents(queueName, { connection });
    await queue.waitUntilReady();
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
      worker = null;
    }
    await queueEvents.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('retries a failing processor until it succeeds', async () => {
    let runs = 0;
    worker = new Worker(
      queueName,
      async () => {
        runs += 1;
        if (runs === 1) {
          throw new Error('transient failure');
        }
        return 'ok';
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();

    const job = await queue.add(
      'parse-cv',
      {},
      { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
    );
    await job.waitUntilFinished(queueEvents, 15_000);

    expect(runs).toBe(2);
  });

  it('dead-letters an unknown job name in the failed set', async () => {
    worker = new Worker(queueName, (job) => route(job), { connection });
    await worker.waitUntilReady();

    const job = await queue.add('not-a-real-job', {}, { attempts: 1 });
    await expect(job.waitUntilFinished(queueEvents, 15_000)).rejects.toThrow();

    const fetched = await queue.getJob(job.id as string);
    await expect(fetched?.getState()).resolves.toBe('failed');
  });
});
