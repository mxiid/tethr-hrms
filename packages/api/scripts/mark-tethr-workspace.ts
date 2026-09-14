import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Organization } from '../src/modules/organization/entities/organization.entity';

// Backfills `organizations.kind = 'tethr'` for the platform workspace on an
// existing database. Ordinary signup always creates a client workspace and the
// kind is what platform-scope guards key on, so a database created before the
// kind was introduced needs this once.
//
//   npm run mark:tethr-workspace -w @hrms/api -- --email tethr.admin@demo.test
//   npm run mark:tethr-workspace -w @hrms/api -- --email new@example.com --move
//
// The partial unique index on kind='tethr' is the invariant; this script only
// resolves which workspace an operator belongs to and flips it idempotently.
// `--move` clears the previous platform workspace first, so the mark can be
// re-pointed without manual SQL.

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */
const emailFlagIndex = process.argv.indexOf('--email');
const email = emailFlagIndex >= 0 ? process.argv[emailFlagIndex + 1]?.trim().toLowerCase() : null;
const move = process.argv.includes('--move');

const main = async (): Promise<void> => {
  if (!email) {
    throw new Error(
      'Usage: npm run mark:tethr-workspace -w @hrms/api -- --email <tethr-admin@example.com> [--move]',
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());

    const users = await dataSource.query<{ organizationId: string }[]>(
      'select "organizationId" from users where lower(email) = $1 limit 2',
      [email],
    );
    if (users.length === 0) {
      throw new Error(`No workspace user found with email ${email}`);
    }

    await dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(Organization);
      const organization = await organizations.findOne({
        where: { id: users[0].organizationId },
      });
      if (!organization) {
        throw new Error(`No workspace found for ${email}`);
      }
      if (organization.kind === 'tethr') {
        console.log(`"${organization.displayName}" is already the Tethr workspace.`);
        return;
      }
      const existingTethr = await organizations.findOne({ where: { kind: 'tethr' } });
      if (existingTethr) {
        if (!move) {
          throw new Error(
            `"${existingTethr.displayName}" is already the Tethr workspace — pass --move to re-point it.`,
          );
        }
        existingTethr.kind = 'client';
        await organizations.save(existingTethr);
        console.log(`Unmarked previous Tethr workspace "${existingTethr.displayName}".`);
      }
      organization.kind = 'tethr';
      await organizations.save(organization);
      console.log(`Marked "${organization.displayName}" (${organization.id}) as the Tethr workspace.`);
    });
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
