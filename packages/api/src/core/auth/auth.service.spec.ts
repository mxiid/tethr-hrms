import { toId, type EmployeeId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import { UnauthenticatedError } from '../../common/errors';
import type { AuthorizationService } from '../authz/authz.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { AuthService } from './auth.service';
import type { JwtClaims } from './jwt-claims';
import type { PasswordService } from './password.service';
import type { User } from './user.entity';

const ORGANIZATION = toId<OrganizationId>('organization-1');
const USER = toId<UserId>('user-1');
const EMPLOYEE = toId<EmployeeId>('employee-1');

const userRow = (overrides: Partial<User> = {}): User =>
  ({
    id: USER,
    organizationId: ORGANIZATION,
    email: 'person@acme.test',
    passwordHash: 'hash',
    status: 'active',
    tokenVersion: 0,
    mfaEnabled: false,
    isWorkspaceCreator: false,
    employeeId: EMPLOYEE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as User;

const buildService = (
  options: {
    readonly manager?: Partial<EntityManager>;
    readonly jwtSign?: jest.Mock;
    readonly memo?: jest.Mock;
  } = {},
) => {
  const manager = {
    find: jest.fn().mockResolvedValue([userRow()]),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    ...options.manager,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => unknown) => callback(manager)),
  } as unknown as DataSource;
  const authorization = {
    removeAllRolesForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthorizationService;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION),
    getUserId: jest.fn().mockReturnValue(USER),
    memo: options.memo ?? jest.fn((_key: string, factory: () => unknown) => factory()),
  } as unknown as TenantContextService;
  const users = {
    findById: jest.fn().mockResolvedValue(userRow()),
  } as unknown as TenantScopedRepository<User>;
  const userRepository = {
    findOne: jest.fn().mockResolvedValue(userRow()),
  };
  const jwtService = { sign: options.jwtSign ?? jest.fn().mockReturnValue('token') };
  const service = new AuthService(
    users,
    userRepository as never,
    dataSource,
    {} as PasswordService,
    jwtService as never,
    tenantContext,
    authorization,
  );
  return {
    service,
    manager,
    dataSource,
    authorization,
    tenantContext,
    users,
    userRepository,
    jwtService,
  };
};

describe('AuthService session hardening', () => {
  it('embeds the session epoch in every issued token', () => {
    const { service, jwtService } = buildService();

    service.issueToken(userRow({ tokenVersion: 4 }));

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining<Partial<JwtClaims>>({ sub: USER, org: ORGANIZATION, ver: 4 }),
    );
  });

  it('resolves a session only when the row is active, in-tenant, and at the token epoch', async () => {
    const { service } = buildService();

    await expect(service.resolveActiveSession(USER, ORGANIZATION, 0)).resolves.toMatchObject({
      id: USER,
    });
    await expect(service.resolveActiveSession(USER, ORGANIZATION, 1)).resolves.toBeNull();
    await expect(service.resolveActiveSession(USER, 'other-org', 0)).resolves.toBeNull();
  });

  it('resolves a session as null for a disabled user', async () => {
    const memo = jest.fn((_key: string, factory: () => unknown) => factory());
    const users = { findById: jest.fn().mockResolvedValue(userRow({ status: 'disabled' })) };
    const service = new AuthService(
      users as unknown as TenantScopedRepository<User>,
      { findOne: jest.fn().mockResolvedValue(userRow({ status: 'disabled' })) } as never,
      { transaction: jest.fn() } as unknown as DataSource,
      {} as PasswordService,
      { sign: jest.fn() } as never,
      { memo } as unknown as TenantContextService,
      {} as AuthorizationService,
    );

    await expect(service.resolveActiveSession(USER, ORGANIZATION, 0)).resolves.toBeNull();
  });

  it('rejects getCurrentUser for a disabled user', async () => {
    const { service } = buildService({
      manager: {},
    });
    (service as unknown as { users: TenantScopedRepository<User> }).users = {
      findById: jest.fn().mockResolvedValue(userRow({ status: 'disabled' })),
    } as unknown as TenantScopedRepository<User>;

    await expect(service.getCurrentUser()).rejects.toThrow(UnauthenticatedError);
  });

  it('disables logins, bumps the epoch, and revokes roles in one transaction', async () => {
    const { service, manager, authorization, dataSource } = buildService();

    const disabled = await service.disableUsersForEmployee(EMPLOYEE);

    expect(disabled).toBe(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { organizationId: ORGANIZATION, employeeId: EMPLOYEE } }),
    );
    const saved = (manager.save as jest.Mock).mock.calls[0][0] as User;
    expect(saved.status).toBe('disabled');
    expect(saved.tokenVersion).toBe(1);
    expect(authorization.removeAllRolesForUser).toHaveBeenCalledWith(USER, manager);
  });

  it('is idempotent — an already-disabled login is not bumped or re-saved', async () => {
    const { service, manager, authorization } = buildService({
      manager: { find: jest.fn().mockResolvedValue([userRow({ status: 'disabled', tokenVersion: 2 })]) },
    });

    const disabled = await service.disableUsersForEmployee(EMPLOYEE);

    expect(disabled).toBe(0);
    expect(manager.save).not.toHaveBeenCalled();
    expect(authorization.removeAllRolesForUser).not.toHaveBeenCalled();
  });

  it('joins the caller transaction when a manager is passed (event consumer path)', async () => {
    const manager = {
      find: jest.fn().mockResolvedValue([userRow()]),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    } as unknown as EntityManager;
    const { service, dataSource } = buildService();

    await service.disableUsersForEmployee(EMPLOYEE, manager);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalled();
  });
});
