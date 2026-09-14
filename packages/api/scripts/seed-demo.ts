import 'reflect-metadata';
import 'dotenv/config';

import { toId, type OrganizationId, type UserId, type EmployeeId } from '@hrms/shared';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/auth.service';
import { AuthorizationService } from '../src/core/authz/authz.service';
import { TenantContextService } from '../src/core/tenancy/tenant-context.service';
import { AccountService } from '../src/modules/account/account.service';
import { EmployeeService } from '../src/modules/employee/employee.service';
import { OrganizationService } from '../src/modules/organization/organization.service';

// One-shot demo data: a Tethr admin workspace, an onboarded client workspace,
// and an employee self-service account inside the client. Safe to re-run — if
// the accounts already exist it just reprints the credentials.
//
//   npm run seed:demo -w @hrms/api

const PASSWORD = 'Passw0rd!23';
const TETHR_WORKSPACE = 'Tethr HQ (demo)';
const CLIENT_WORKSPACE = 'Acme Inc (demo)';
const SECOND_CLIENT_WORKSPACE = 'Globex (demo)';

const EMAILS = {
  tethrAdmin: 'tethr.admin@demo.test',
  clientAdmin: 'client.admin@demo.test',
  clientTethrAdmin: 'tethr.acme@demo.test',
  secondClientTethrAdmin: 'tethr.globex@demo.test',
  employee: 'employee@demo.test',
} as const;

const isConflict = (error: unknown): boolean =>
  error instanceof Error &&
  /already|taken|exists|duplicate/i.test(error.message);

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const accounts = app.get(AccountService);
  const auth = app.get(AuthService);
  const authz = app.get(AuthorizationService);
  const tenant = app.get(TenantContextService);
  const employees = app.get(EmployeeService);
  const organizations = app.get(OrganizationService);

  const log = new Logger('seed-demo');
  let created = 0;

  // 1. Tethr admin workspace: sign up (creates org + clientAdmin), then
  //    promote that founder to tethrAdmin so it lands in the Tethr portal.
  try {
    const { user } = await accounts.signUp({
      organizationName: TETHR_WORKSPACE,
      email: EMAILS.tethrAdmin,
      password: PASSWORD,
    });
    await tenant.run(
      { organizationId: toId<OrganizationId>(user.organizationId), userId: toId<UserId>(user.id) },
      () => authz.replaceSystemRole(toId<UserId>(user.id), 'tethrAdmin'),
    );
    // The kind is what platform-scope guards key on; ordinary signup always
    // creates a client workspace, so the Tethr one is promoted explicitly.
    await organizations.markAsTethr(toId<OrganizationId>(user.organizationId));
    created += 1;
    log.log(`Created Tethr admin workspace "${TETHR_WORKSPACE}" + ${EMAILS.tethrAdmin}`);
  } catch (error) {
    if (!isConflict(error)) throw error;
    log.log(
      `Tethr admin workspace already exists — skipping (run seed:demo fresh or mark:tethr-workspace --email ${EMAILS.tethrAdmin})`,
    );
  }

  // 2. Client workspace: Tethr-staff-driven onboarding seeds a clientAdmin
  //    (client portal) plus an embedded tethrAdmin for that org.
  let clientOrgId: string | null = null;
  let clientAdminUserId: string | null = null;
  try {
    const result = await accounts.onboardClient({
      legalName: CLIENT_WORKSPACE,
      adminEmail: EMAILS.clientAdmin,
      adminPassword: PASSWORD,
      hrAdminEmail: EMAILS.clientTethrAdmin,
      hrAdminPassword: PASSWORD,
    });
    clientOrgId = result.workspace.id;
    clientAdminUserId = result.initialAdmin.id;
    created += 1;
    log.log(`Onboarded client workspace "${CLIENT_WORKSPACE}" + ${EMAILS.clientAdmin}`);
  } catch (error) {
    if (!isConflict(error)) throw error;
    log.log(`Client workspace already exists — skipping (employee step needs a fresh run)`);
  }

  // 3. Employee self-service account inside the client workspace: create an
  //    employee record, then a user linked to it with the employee role.
  if (clientOrgId && clientAdminUserId) {
    await tenant.run(
      {
        organizationId: toId<OrganizationId>(clientOrgId),
        userId: toId<UserId>(clientAdminUserId),
      },
      async () => {
        const employee = await employees.create({
          employeeNumber: 'EMP-001',
          firstName: 'Evan',
          lastName: 'Employee',
          hireDate: '2025-01-06',
          workEmail: EMAILS.employee,
          workerType: 'permanent',
        });
        const user = await auth.createUser({
          email: EMAILS.employee,
          password: PASSWORD,
          employeeId: toId<EmployeeId>(employee.id),
        });
        await authz.assignSystemRole(toId<UserId>(user.id), 'employee');
      },
    );
    created += 1;
    log.log(`Created employee account ${EMAILS.employee} (EMP-001, Evan Employee)`);
  }

  // 4. A second client workspace for the SAME client-admin email, so the
  //    header workspace switcher has somewhere to switch to.
  try {
    await accounts.onboardClient({
      legalName: SECOND_CLIENT_WORKSPACE,
      adminEmail: EMAILS.clientAdmin,
      adminPassword: PASSWORD,
      hrAdminEmail: EMAILS.secondClientTethrAdmin,
      hrAdminPassword: PASSWORD,
    });
    created += 1;
    log.log(`Onboarded second client workspace "${SECOND_CLIENT_WORKSPACE}" for ${EMAILS.clientAdmin}`);
  } catch (error) {
    if (!isConflict(error)) throw error;
    log.log(`Second client workspace already exists — skipping`);
  }

  await app.close();

  const line = (label: string, email: string): string =>
    `  ${label.padEnd(14)} ${email.padEnd(24)} ${PASSWORD}`;
  process.stdout.write(
    [
      '',
      created > 0 ? `Seed complete (${created} object group(s) created).` : 'Nothing new to create.',
      '',
      'Test accounts (all share the same password):',
      line('Tethr admin', EMAILS.tethrAdmin),
      line('Client admin', EMAILS.clientAdmin),
      line('Employee', EMAILS.employee),
      '',
      `Tethr workspace:   ${TETHR_WORKSPACE}`,
      `Client workspaces: ${CLIENT_WORKSPACE} + ${SECOND_CLIENT_WORKSPACE} (both admined by ${EMAILS.clientAdmin} — use the header switcher)`,
      `Also seeded: ${EMAILS.clientTethrAdmin} / ${EMAILS.secondClientTethrAdmin} / ${PASSWORD} (Tethr admins embedded in each client org)`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
