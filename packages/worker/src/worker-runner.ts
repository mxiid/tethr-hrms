import { JOBS, QUEUES, assertNever, type JobName } from '@hrms/shared';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';

import { processParseCv } from './processors/parse-cv.processor';

// Routes jobs to their processor by name. An unknown name can only come from a
// producer this build does not know about (or a malformed enqueue), so it
// throws instead of completing: BullMQ retries it and finally dead-letters it
// in the failed set, where the work is visible, rather than silently dropping
// it or pretending success.
export const route = async (job: Job): Promise<void> => {
  const jobName = job.name as JobName;
  switch (jobName) {
    case JOBS.parseCv:
      await processParseCv(job);
      return;
    default:
      // Exhaustive over JobName: adding a job without a case fails the build.
      return assertNever(jobName, `Unknown job name "${job.name}"`);
  }
};

// The API enqueues via core/queue/MessageQueueService; `parse-cv` is its only
// producer today (CV uploads, from the AI seam). Retries and backoff are job
// options set by the producer's `defaultJobOptions` (MessageQueueService) —
// BullMQ's Worker has no job-option defaults of its own.
export const startWorker = (connection: ConnectionOptions): Worker[] => {
  const worker = new Worker(QUEUES.default, (job) => route(job), { connection });

  // BullMQ emits 'error' on connection failures, and an unhandled EventEmitter
  // 'error' crashes the process — this listener is mandatory, not decoration.
  worker.on('error', (error) => {
    console.error(`[worker] queue error: ${error.message}`);
  });
  worker.on('failed', (job, error) => {
    const attempt = job ? job.attemptsMade : 0;
    const maxAttempts = job?.opts.attempts ?? 1;
    console.error(
      `[worker] job ${job?.id ?? 'unknown'} (${job?.name ?? 'unknown'}) failed on attempt ${attempt}/${maxAttempts}: ${error.message}`,
    );
  });
  worker.on('stalled', (jobId) => {
    console.error(`[worker] job ${jobId} stalled; BullMQ will retry it`);
  });

  return [worker];
};
