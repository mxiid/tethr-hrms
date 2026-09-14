import { toId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import type { AuditService } from '../audit/audit.service';
import type { AuthorizationService } from '../authz/authz.service';
import { PERMISSIONS } from '../authz/permissions';

import { PlatformScopeService } from './platform-scope.service';
import type { TenantContextService } from './tenant-context.service';

const TETHR = toId<OrganizationId>('org-tethr');
const CLIENT = toId<OrganizationId>('org-client');
const USER = toId<UserId>('user-1');

const buildService = (options: {
  kind: string | undefined;
  authenticated?: boolean;
  permissions?: readonly string[];
  clientOrgIds?: readonly string[];
}) => {
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('select kind')) {
      return Promise.resolve(options.kind === undefined ? [] : [{ kind: options.kind }]);
    }
    if (sql.includes("kind = 'client'")) {
      return Promise.resolve((options.clientOrgIds ?? [CLIENT]).map((id) => ({ id })));
    }
    if (sql.includes("kind = 'tethr'")) {
      return Promise.resolve(options.kind === 'tethr' ? [{ id: TETHR }] : []);
    }
    return Promise.resolve([]);
  });
  const dataSource = { query } as unknown as DataSource;
  const run = jest.fn((_context: unknown, callback: () => unknown) => callback());
  const tenantContext = {
    getUserId: jest.fn().mockReturnValue(options.authenticated === false ? null : USER),
    getOrganizationId: jest.fn().mockReturnValue(TETHR),
    run,
  } as unknown as TenantContextService;
  const authorization = {
    getAccessForUserInOrganization: jest.fn().mockResolvedValue({
      roleKeys: ['tethrHr'],
      permissions: options.permissions ?? [PERMISSIONS.platformReadAll],
      portal: 'tethr',
    }),
  } as unknown as AuthorizationService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  return {
    service: new PlatformScopeService(dataSource, tenantContext, authorization, audit),
    query,
    run,
    authorization,
    audit,
  };
};

describe('PlatformScopeService', () => {
  it('returns the operator when the caller is in the Tethr workspace and holds the permission', async () => {
    const { service } = buildService({ kind: 'tethr' });

    await expect(service.assertOperator(PERMISSIONS.platformReadAll)).resolves.toMatchObject({
      userId: USER,
      organizationId: TETHR,
    });
  });

  it('refuses a client workspace even when the permission string is present', async () => {
    const { service, authorization } = buildService({
      kind: 'client',
      permissions: [PERMISSIONS.platformReadAll],
    });

    await expect(service.assertOperator(PERMISSIONS.platformReadAll)).rejects.toThrow(
      'restricted to the Tethr workspace',
    );
    expect(authorization.getAccessForUserInOrganization).not.toHaveBeenCalled();
  });

  it('refuses an operator without the permission', async () => {
    const { service } = buildService({ kind: 'tethr', permissions: [PERMISSIONS.employeeRead] });

    await expect(service.assertOperator(PERMISSIONS.platformReadAll)).rejects.toThrow(
      'Missing platform permission',
    );
  });

  it('refuses an unauthenticated caller', async () => {
    const { service } = buildService({ kind: 'tethr', authenticated: false });

    await expect(service.assertOperator(PERMISSIONS.platformReadAll)).rejects.toThrow(
      'Authentication required',
    );
  });

  it('lists client workspaces for the board', async () => {
    const other = toId<OrganizationId>('org-client-2');
    const { service } = buildService({ kind: 'tethr', clientOrgIds: [CLIENT, other] });

    await expect(service.listClientOrganizationIds()).resolves.toEqual([CLIENT, other]);
  });

  it('resolves the single Tethr workspace and fails when there is none', async () => {
    const configured = buildService({ kind: 'tethr' });
    await expect(configured.service.resolveTethrOrganizationId()).resolves.toBe(TETHR);

    const missing = buildService({ kind: 'client' });
    await expect(missing.service.resolveTethrOrganizationId()).rejects.toThrow(
      'No Tethr workspace is configured',
    );
  });

  it('audits before switching and runs the work in the target workspace', async () => {
    const { service, run, audit } = buildService({ kind: 'tethr' });
    const work = jest.fn().mockResolvedValue('done');

    await expect(
      service.switchTo(
        {
          organizationId: CLIENT,
          purpose: 'board read',
          resourceType: 'hiring_request',
          resourceId: 'request-1',
        },
        work,
      ),
    ).resolves.toBe('done');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.switch',
        resourceType: 'hiring_request',
        resourceId: 'request-1',
        metadata: { purpose: 'board read', targetOrganizationId: CLIENT },
      }),
    );
    expect(run).toHaveBeenCalledWith({ organizationId: CLIENT, userId: USER }, work);
  });

  it('refuses to switch for an unauthenticated caller', async () => {
    const { service } = buildService({ kind: 'tethr', authenticated: false });

    await expect(
      service.switchTo(
        { organizationId: CLIENT, purpose: 'x', resourceType: 'y', resourceId: 'z' },
        jest.fn(),
      ),
    ).rejects.toThrow('Authentication required');
  });
});
