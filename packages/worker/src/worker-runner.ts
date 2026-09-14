import { JOBS, QUEUES, type JobName } from '@hrms/shared';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';

import { processParseCv } from './processors/parse-cv.processor';

// Routes jobs to their processor by name. A real worker would dead-letter
// unknown job names rather than ignore them.
const route = async (job: Job): Promise<void> => {
  const jobName = job.name as JobName;
  switch (jobName) {
    case JOBS.parseCv:
      await processParseCv(job);
      return;
    default:
      console.warn(`[worker] ignoring unknown job "${job.name}"`);
      return;
  }
};

// The API enqueues via core/queue/MessageQueueService; `parse-cv` is its only
// producer today (CV uploads, from the AI seam).
export const startWorker = (connection: ConnectionOptions): Worker[] => [
  new Worker(QUEUES.default, (job) => route(job), { connection }),
];
