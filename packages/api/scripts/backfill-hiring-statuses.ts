import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

// One-off: the request lifecycle shrank from seven statuses to five. The old
// pipeline statuses were hand-set and are now derived from applications, so
// they collapse into 'open'. Idempotent — safe to re-run.
//
//   npm run backfill:hiring-statuses -w @hrms/api

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */
const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const updated = await dataSource.query(
      `update hiring_requests
         set status = 'open'
       where status in ('inReview', 'sourcing', 'interviewing', 'offer')
       returning id`,
    );
    console.log(`Updated ${Array.isArray(updated) ? updated.length : 0} hiring request row(s) to 'open'.`);
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
