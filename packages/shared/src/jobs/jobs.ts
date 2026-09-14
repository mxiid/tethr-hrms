import type { OrganizationId } from '../ids/branded-id';

// The worker's contract lives in @hrms/shared so the API (producer) and the
// worker (consumer) agree on names, queues and payload shapes at compile time —
// the same reason DomainEvent lives here. The worker wraps BullMQ; business
// code only ever references these constants (architecture.md §4).

// Logical queue names. Business code references these constants, never raw
// strings, so a typo is a compile error.
export const QUEUES = {
  default: 'hrms-default',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  parseCv: 'parse-cv',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

// Typed payload per job — the abstraction enforces that callers pass the right
// shape for the job they enqueue.
export type JobPayloads = {
  // The AI seam: enqueued when a candidate CV is uploaded; the current processor
  // is a stub that leaves the parse record awaiting AI. The real parser drops
  // into this one processor later (recruitment-ats-plan.md Phase 3).
  'parse-cv': {
    readonly organizationId: OrganizationId;
    readonly candidateDocumentId: string;
  };
};
