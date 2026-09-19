import { JOBS, QUEUES } from '@hrms/shared';
import { Worker, type Job } from 'bullmq';

import { processParseCv } from './processors/parse-cv.processor';
import { route, startWorker } from './worker-runner';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('./processors/parse-cv.processor', () => ({
  processParseCv: jest.fn().mockResolvedValue(undefined),
}));

const WorkerMock = Worker as unknown as jest.Mock;
const processParseCvMock = processParseCv as jest.MockedFunction<typeof processParseCv>;

const buildJob = (name: string): Job =>
  ({
    name,
    data: { organizationId: 'org-1', candidateDocumentId: 'doc-1' },
  }) as unknown as Job;

describe('worker-runner', () => {
  beforeEach(() => {
    WorkerMock.mockClear();
    processParseCvMock.mockClear();
  });

  it('listens on the default queue with the supplied connection', () => {
    const connection = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };

    startWorker(connection);

    expect(WorkerMock).toHaveBeenCalledWith(QUEUES.default, expect.any(Function), { connection });
  });

  it('registers error, failed, and stalled listeners', () => {
    const [worker] = startWorker({ host: 'localhost', port: 6379 });
    const events = (worker.on as jest.Mock).mock.calls.map((call) => call[0]);

    expect(events).toEqual(expect.arrayContaining(['error', 'failed', 'stalled']));
  });

  it('keeps the process alive when the connection emits an error', () => {
    const [worker] = startWorker({ host: 'localhost', port: 6379 });
    const errorListener = (worker.on as jest.Mock).mock.calls.find(
      ([event]) => event === 'error',
    )[1] as (error: Error) => void;
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => errorListener(new Error('connect ECONNREFUSED'))).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('connect ECONNREFUSED'));
    log.mockRestore();
  });

  it('routes known jobs to their processor', async () => {
    await route(buildJob(JOBS.parseCv));

    expect(processParseCvMock).toHaveBeenCalledTimes(1);
    expect(processParseCvMock).toHaveBeenCalledWith(expect.objectContaining({ name: JOBS.parseCv }));
  });

  it('dead-letters unknown job names by throwing', async () => {
    await expect(route(buildJob('not-a-real-job'))).rejects.toThrow(
      'Unknown job name "not-a-real-job"',
    );
    expect(processParseCvMock).not.toHaveBeenCalled();
  });

  it('wires the constructed processor through the same route', async () => {
    startWorker({ host: 'localhost', port: 6379 });
    const processor = WorkerMock.mock.calls[0][1] as (job: Job) => Promise<void>;

    await expect(processor(buildJob('not-a-real-job'))).rejects.toThrow('Unknown job name');
    await processor(buildJob(JOBS.parseCv));
    expect(processParseCvMock).toHaveBeenCalledTimes(1);
  });
});
