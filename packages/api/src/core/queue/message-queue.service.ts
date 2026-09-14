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
  ): Promise<void> {
    await this.queue(queueName).add(jobName, payload);
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
        maxRetriesPerRequest: null,
      },
    });
    this.queues.set(name, queue);
    return queue;
  }
}
