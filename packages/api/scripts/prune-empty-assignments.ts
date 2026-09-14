import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Assignment } from '../src/modules/assignment/entities/assignment.entity';

// Before same-day reassignment became an in-place correction, changing a manager
// twice in one day closed the first row at the date it opened, leaving a row
// that was never in force (validFrom === validTo). Those rows only clutter the
// assignment history. New ones cannot be created; this clears any left behind.
//
//   npm run prune:empty-assignments -w @hrms/api

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */

const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const result = await dataSource
      .getRepository(Assignment)
      .createQueryBuilder()
      .delete()
      .where('"validTo" IS NOT NULL AND "validTo" = "validFrom"')
      .execute();

    console.log(
      result.affected
        ? `Removed ${result.affected} assignment row(s) that were never in force.`
        : 'Nothing to remove — no zero-length assignments.',
    );
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
