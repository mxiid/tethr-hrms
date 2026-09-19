import { JOBS } from '@hrms/shared';
import type { Job } from 'bullmq';

import { processParseCv } from './parse-cv.processor';

describe('processParseCv', () => {
  it('logs the document awaiting AI parsing and resolves', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const job = {
      name: JOBS.parseCv,
      data: { organizationId: 'org-1', candidateDocumentId: 'document-1' },
    } as unknown as Job;

    await expect(processParseCv(job)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('document-1'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('org-1'));
    log.mockRestore();
  });
});
