import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// PermissionsGuard returns true when a handler carries no permissions metadata
// (see permissions.guard.ts), so an operation without @RequirePermissions is
// open to every caller. That is how the whole attendance module shipped
// unguarded. This test walks the resolver sources and fails on any new one.

const SRC_ROOT = join(__dirname, '..', '..');

// Operations that must stay reachable without a permission: they either run
// before a session exists, or they answer questions about the caller's own
// session and do their own checks inside the service.
const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'health/health.resolver.ts:health',
  'core/auth/auth.resolver.ts:me',
  'core/auth/auth.resolver.ts:selectWorkspace',
  'core/auth/auth.resolver.ts:hasOtherWorkspaces',
  'core/auth/auth.resolver.ts:emailIsAlreadyRegistered',
  'modules/account/account.resolver.ts:signUp',
  'modules/account/account.resolver.ts:login',
  'modules/account/account.resolver.ts:legalNameIsAlreadyUsed',
  'modules/account/account.resolver.ts:hasCreatedWorkspace',
  'modules/account/account.resolver.ts:switchableWorkspaces',
  'modules/account/account.resolver.ts:switchWorkspace',
  'modules/organization/organization.resolver.ts:myOrganization',
  'modules/leave/leave.resolver.ts:leaveTypes',
  // Anonymous form surface: no session, but every operation verifies the signed
  // form-link token and runs inside that link's tenant (PublicFormsResolver).
  'modules/forms/public-forms.resolver.ts:formByLink',
  'modules/forms/public-forms.resolver.ts:prepareFormFileUpload',
  'modules/forms/public-forms.resolver.ts:submitForm',
]);

// Known gaps, kept explicit so they are visible and this list can only shrink.
// Each of these is reachable by any authenticated caller for any employee id.
const KNOWN_UNGUARDED: ReadonlySet<string> = new Set([
  'modules/clients/client.resolver.ts:clients',
  'modules/employee/employee.resolver.ts:createEmployeeEducation',
  'modules/employee/employee.resolver.ts:updateEmployeeEducation',
  'modules/employee/employee.resolver.ts:deleteEmployeeEducation',
  'modules/employee/employee.resolver.ts:createEmployeeWorkHistory',
  'modules/employee/employee.resolver.ts:updateEmployeeWorkHistory',
  'modules/employee/employee.resolver.ts:deleteEmployeeWorkHistory',
]);

const findResolverFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return findResolverFiles(full);
    return entry.endsWith('.resolver.ts') ? [full] : [];
  });

// Built per call: a /g regex carries lastIndex between matchAll calls, so a
// shared instance would silently skip files after the first.
const operationPattern = (): RegExp =>
  /@(?:Query|Mutation)\([^\r\n]*\)\r?\n((?:[ \t]*@[^\r\n]*\r?\n)*)[ \t]*(?:async[ \t]+)?([A-Za-z_]\w*)[ \t]*\(/g;

const unguardedOperations = (): string[] =>
  findResolverFiles(SRC_ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const key = relative(SRC_ROOT, file).split(sep).join('/');
    return [...source.matchAll(operationPattern())]
      .filter(([, decorators]) => !decorators.includes('RequirePermissions'))
      .map(([, , name]) => `${key}:${name}`);
  });

describe('resolver authorization', () => {
  it('guards every GraphQL operation that is not deliberately public', () => {
    const unexpected = unguardedOperations().filter(
      (operation) => !PUBLIC_OPERATIONS.has(operation) && !KNOWN_UNGUARDED.has(operation),
    );
    expect(unexpected).toEqual([]);
  });

  it('guards every attendance operation', () => {
    const attendance = unguardedOperations().filter((operation) =>
      operation.startsWith('modules/attendance/'),
    );
    expect(attendance).toEqual([]);
  });

  it('keeps the known-unguarded list honest — entries removed once fixed', () => {
    const stillUnguarded = new Set(unguardedOperations());
    const alreadyFixed = [...KNOWN_UNGUARDED].filter(
      (operation) => !stillUnguarded.has(operation),
    );
    expect(alreadyFixed).toEqual([]);
  });
});
