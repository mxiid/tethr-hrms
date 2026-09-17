import type { JobName, JobPayloads, QueueName } from '@hrms/shared';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ConfigService } from '../config/config.service';

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
    await this.queue(queueName).add(jobName, payload, options);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  private queue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(name, {
      connection: {
        host: this.config.get('REDIS_HOST'),
        port: this.config.get('REDIS_PORT'),
        // The API is a producer only. Buffering commands in the offline queue
        // would hang `add` forever when Redis is down (a request or consumer
        // path awaits it), so fail fast within a bounded time instead.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2_000)),
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
