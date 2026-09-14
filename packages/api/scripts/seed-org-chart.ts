import 'reflect-metadata';
import 'dotenv/config';

import {
  toId,
  type DepartmentId,
  type EmployeeId,
  type JobId,
  type OrganizationId,
  type PositionId,
  type UserId,
} from '@hrms/shared';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { User } from '../src/core/auth/user.entity';
import { TenantContextService } from '../src/core/tenancy/tenant-context.service';
import { AssignmentService } from '../src/modules/assignment/assignment.service';
import { EmployeeService } from '../src/modules/employee/employee.service';
import { Department } from '../src/modules/organization/entities/department.entity';
import { Job } from '../src/modules/position/entities/job.entity';
import { PositionService } from '../src/modules/position/position.service';

// Seeds a deliberately non-linear reporting tree so the org chart has something
// to actually render: four levels deep on one branch, sibling branches of
// different widths, and an individual contributor sitting at manager level.
//
// Reporting lines are only reachable through AssignmentService — no GraphQL
// mutation sets reportsToEmployeeId — which is why a workspace built through the
// UI is always flat.
//
//   npm run seed:org-chart -w @hrms/api -- <email>

/* eslint-disable no-console -- a one-shot CLI script: stdout is the interface. */

type Node = {
  readonly first: string;
  readonly last: string;
  readonly title: string;
  readonly reportsTo: string | null;
};

// Keyed by "first last" so reportsTo reads as a name rather than an index.
const TREE: readonly Node[] = [
  { first: 'Amara', last: 'Okafor', title: 'Chief Executive', reportsTo: null },

  { first: 'Rahul', last: 'Mehta', title: 'VP Engineering', reportsTo: 'Amara Okafor' },
  { first: 'Sofia', last: 'Nowak', title: 'Engineering Manager, Platform', reportsTo: 'Rahul Mehta' },
  { first: 'Ben', last: 'Carter', title: 'Senior Engineer', reportsTo: 'Sofia Nowak' },
  { first: 'Wei', last: 'Liu', title: 'Engineer', reportsTo: 'Sofia Nowak' },
  { first: 'Priya', last: 'Nair', title: 'Engineer', reportsTo: 'Sofia Nowak' },
  { first: 'Tom', last: 'Hayes', title: 'Engineering Manager, Product', reportsTo: 'Rahul Mehta' },
  { first: 'Elena', last: 'Rossi', title: 'Senior Engineer', reportsTo: 'Tom Hayes' },
  { first: 'Marcus', last: 'Bell', title: 'Engineer', reportsTo: 'Tom Hayes' },
  // Deepest branch: five levels from the root.
  { first: 'Noor', last: 'Rahman', title: 'Associate Engineer', reportsTo: 'Elena Rossi' },
  // Staff IC reporting straight to the VP, no reports of their own.
  { first: 'Dana', last: 'Levi', title: 'Staff Engineer', reportsTo: 'Rahul Mehta' },

  { first: 'Yuki', last: 'Tanaka', title: 'VP Revenue', reportsTo: 'Amara Okafor' },
  { first: 'Omar', last: 'Haddad', title: 'Sales Lead', reportsTo: 'Yuki Tanaka' },
  { first: 'Grace', last: 'Kim', title: 'Account Executive', reportsTo: 'Omar Haddad' },
  { first: 'Diego', last: 'Alvarez', title: 'Account Executive', reportsTo: 'Omar Haddad' },
  { first: 'Nina', last: 'Petrova', title: 'Marketing Lead', reportsTo: 'Yuki Tanaka' },

  { first: 'Aisha', last: 'Bello', title: 'Head of People', reportsTo: 'Amara Okafor' },
  { first: 'Jonas', last: 'Weber', title: 'People Partner', reportsTo: 'Aisha Bello' },
];

const HIRE_DATE = '2025-01-06';

const main = async (): Promise<void> => {
  const email = (process.argv[2] ?? 'talha@talha.com').trim().toLowerCase();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const users = dataSource.getRepository(User);
    const account = await users.findOne({ where: { email } });
    if (!account) {
      console.error(`No user found for ${email}.`);
      process.exitCode = 1;
      return;
    }

    const organizationId = toId<OrganizationId>(account.organizationId);
    console.log(`Seeding org chart into organization ${organizationId} (${email})`);

    const tenantContext = app.get(TenantContextService);
    const employeeService = app.get(EmployeeService);
    const assignmentService = app.get(AssignmentService);
    const positionService = app.get(PositionService);

    await tenantContext.run({ organizationId, userId: toId<UserId>(account.id) }, async () => {
      // A position needs a job, and a job is reference data with no service of
      // its own, so both are created directly here.
      const departments = dataSource.getRepository(Department);
      const department =
        (await departments.findOne({ where: { organizationId, name: 'Company' } })) ??
        (await departments.save(
          departments.create({ organizationId, name: 'Company', parentDepartmentId: null }),
        ));

      const jobs = dataSource.getRepository(Job);
      const job =
        (await jobs.findOne({ where: { organizationId, title: 'General' } })) ??
        (await jobs.save(jobs.create({ organizationId, title: 'General', jobFamilyId: null })));

      const stamp = Date.now().toString().slice(-6);
      const idsByName = new Map<string, EmployeeId>();

      // Two passes: everyone exists before any reporting line is drawn, so the
      // order of TREE does not matter.
      for (const node of TREE) {
        const employee = await employeeService.create({
          employeeNumber: `ORG-${stamp}-${idsByName.size + 1}`,
          firstName: node.first,
          lastName: node.last,
          roleTitle: node.title,
          workEmail: `${node.first}.${node.last}`.toLowerCase() + `+${stamp}@example.test`,
          hireDate: HIRE_DATE,
          workerType: 'permanent',
        });
        idsByName.set(`${node.first} ${node.last}`, toId<EmployeeId>(employee.id));
      }

      for (const node of TREE) {
        const employeeId = idsByName.get(`${node.first} ${node.last}`);
        if (!employeeId) continue;

        const position = await positionService.create({
          title: node.title,
          jobId: toId<JobId>(job.id),
          departmentId: toId<DepartmentId>(department.id),
          headcount: 1,
        });

        await assignmentService.create({
          employeeId,
          positionId: toId<PositionId>(position.id),
          validFrom: HIRE_DATE,
          assignmentType: 'primary',
          isPrimary: true,
          reportsToEmployeeId: node.reportsTo
            ? (idsByName.get(node.reportsTo) ?? null)
            : null,
        });
      }

      console.log(`Created ${idsByName.size} employees with reporting lines.`);
      console.log('Open /employees/org-chart to see the tree.');
    });
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
