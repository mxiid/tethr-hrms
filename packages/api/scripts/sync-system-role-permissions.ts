import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Role } from '../src/core/authz/role.entity';
import { SYSTEM_ROLES } from '../src/core/authz/system-roles';

// System roles are seeded per organization the first time they are needed, and
// `ensureSystemRole` returns an existing row untouched — by design, so an admin
// can adapt a role without shipping code. The side effect is that a permission
// added to SYSTEM_ROLES after an organization was created never reaches it.
//
// This backfills those. It is strictly ADDITIVE: it only adds permissions the
// role definition lists and the row is missing. It never removes a permission,
// so deliberate customisations survive.
//
//   npm run sync:role-permissions -w @hrms/api

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */
const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const roles = dataSource.getRepository(Role);
    const rows = await roles.find();

    let changed = 0;
    for (const row of rows) {
      const definition = SYSTEM_ROLES[row.key as keyof typeof SYSTEM_ROLES];
      if (!definition) continue;

      const held = new Set(row.permissions);
      const missing = definition.permissions.filter((permission) => !held.has(permission));
      if (missing.length === 0) continue;

      row.permissions = [...row.permissions, ...missing];
      await roles.save(row);
      changed += 1;
      console.log(`${row.key} (org ${row.organizationId}) += ${missing.join(', ')}`);
    }

    console.log(
      changed === 0
        ? `Nothing to do — all ${rows.length} role rows already hold their definition's permissions.`
        : `Updated ${changed} of ${rows.length} role rows.`,
    );
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
