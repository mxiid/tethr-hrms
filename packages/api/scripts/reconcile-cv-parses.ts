import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { OrganizationId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { TenantContextService } from '../src/core/tenancy/tenant-context.service';
import { AtsService } from '../src/modules/recruitment/ats.service';

// Re-enqueues CV parse jobs whose enqueue failed when the projection committed
// (the CvParse row is left `pending` with no job). Idempotent: jobs carry a
// `parse-cv:<documentId>` jobId, so re-runs dedupe, and parsed documents leave
// the pending set.
//
//   npm run reconcile:cv-parses -w @hrms/api

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */
const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const ats = app.get(AtsService);
    const tenantContext = app.get(TenantContextService);

    const rows = await dataSource.query<{ organizationId: string }[]>(
      `SELECT DISTINCT "organizationId" FROM cv_parses WHERE status = 'pending'`,
    );
    let enqueued = 0;
    for (const row of rows) {
      enqueued += await tenantContext.run(
        { organizationId: row.organizationId as OrganizationId, userId: null },
        () => ats.reconcilePendingCvParses(),
      );
    }
    console.log(
      `Re-enqueued ${enqueued} pending CV parse job(s) across ${rows.length} workspace(s).`,
    );
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});