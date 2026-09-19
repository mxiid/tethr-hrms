import type { JobName, JobPayloads, QueueName } from '@hrms/shared';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ConfigService } from '../config/config.service';

// BullMQ's Queue waits for its Redis connection to become ready without a
// bound; the connection is allowed to keep retrying (so a restored Redis heals
// the cached Queue), which together hang `add` forever while Redis is down.
const QUEUE_READY_TIMEOUT_MS = 5_000;

// The API's queue producer. Business code calls `add(queue, job, payload)` and
// never touches BullMQ (architecture.md §4) — the transport stays swappable and
// job names/payloads stay typed by the @hrms/shared contract. Queues are created
// lazily so booting the API without Redis is fine until something is enqueued.
@Injectable()
export class MessageQueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly config: ConfigService) {}

  async add<TJob extends JobName>(
    queueName: QueueName,
    jobName: TJob,
    payload: JobPayloads[TJob],
    options?: { readonly jobId?: string },
  ): Promise<void> {
    const queue = this.queue(queueName);
    await this.waitUntilReady(queue);
    await queue.add(jobName, payload, options);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  // Bound the readiness wait: a request or consumer calling `add` must never
  // hang on a missing Redis. The connection keeps retrying in the background,
  // so the next `add` succeeds once Redis is back.
  private async waitUntilReady(queue: Queue): Promise<void> {
    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        queue.waitUntilReady(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis is not reachable; the job was not enqueued')),
            QUEUE_READY_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private queue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(name, {
      connection: {
        host: this.config.get('REDIS_HOST'),
        port: this.config.get('REDIS_PORT'),
        // The API is a producer only. Buffering commands in the offline queue
        // would hang `add` forever when Redis is down, so fail fast. The client
        // keeps reconnecting with a capped delay: giving up would leave the
        // cached Queue dead forever, even after Redis returns.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        retryStrategy: (times) => Math.min(times * 500, 2_000),
      },
      // Same retry contract as the outbox (MAX_ATTEMPTS = 5): a job is retried
      // with exponential backoff before it is left failed.
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });
    this.queues.set(name, queue);
    return queue;
  }
}
