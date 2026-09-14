import type { JobPayloads } from '@hrms/shared';
import type { Job } from 'bullmq';

// The AI parsing seam, deliberately a stub: the CV record is created (and stays
// `pending`) when the upload completes; this processor is where a real provider
// call lands later. Manual scoring and every downstream step work without it, so
// the pipeline is fully usable today.
export const processParseCv = async (job: Job<JobPayloads['parse-cv']>): Promise<void> => {
  console.log(
    `[worker] parse-cv stub -> document ${job.data.candidateDocumentId} in org ${job.data.organizationId} (awaiting AI)`,
  );
  return Promise.resolve();
};
