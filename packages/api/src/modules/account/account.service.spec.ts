import { toId, type ClientId, type OrganizationId, type UserId } from '@hrms/shared';

import type { AuthService } from '../../core/auth/auth.service';
import type { User } from '../../core/auth/user.entity';
import type { AuthorizationService } from '../../core/authz/authz.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { ClientService } from '../clients/client.service';
import type { Client } from '../clients/entities/client.entity';
import type { Organization } from '../organization/entities/organization.entity';
import type { OrganizationService } from '../organization/organization.service';

import { AccountService } from './account.service';

const ORGANIZATION = toId<OrganizationId>('organization-1');
const CLIENT = toId<ClientId>('client-1');
const USER = toId<UserId>('user-1');

const client = {
  id: CLIENT,
  name: 'Acme LLC',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as Client;

const organization = {
  id: ORGANIZATION,
  kind: 'client',
  legalName: 'Acme LLC',
  displayName: 'Acme',
  slug: 'acme-llc',
  clientId: CLIENT,
  defaultLocale: 'en',
  defaultCurrency: 'USD',
  settings: {},
  brandColor: 'iris',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as Organization;

const HR_ADMIN_USER = toId<UserId>('user-2');

const adminUser = {
  id: USER,
  organizationId: ORGANIZATION,
  email: 'admin@acme.test',
  passwordHash: 'hash',
  status: 'active',
  tokenVersion: 0,
  mfaEnabled: false,
  employeeId: null,
  isWorkspaceCreator: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as User;

const hrAdminUser = {
  ...adminUser,
  id: HR_ADMIN_USER,
  email: 'hr@tethrhq.test',
  isWorkspaceCreator: false,
} as User;

const buildService = () => {
  const organizationService = {
    create: jest.fn().mockResolvedValue(organization),
    getById: jest.fn().mockResolvedValue(organization),
    legalNameExists: jest.fn().mockResolvedValue(false),
  } as unknown as OrganizationService;
  const clientService = {
    create: jest.fn().mockResolvedValue(client),
    getById: jest.fn().mockResolvedValue(client),
    list: jest.fn().mockResolvedValue([client]),
  } as unknown as ClientService;
  const authService = {
    createUser: jest.fn().mockResolvedValueOnce(adminUser).mockResolvedValueOnce(hrAdminUser),
    findVerifiedUsers: jest.fn(),
    issueToken: jest.fn().mockReturnValue('token'),
    issueWorkspaceSelectionToken: jest.fn().mockReturnValue('selection-token'),
    hasCreatedWorkspace: jest.fn().mockResolvedValue(false),
  } as unknown as AuthService;
  const authorization = {
    assignSystemRole: jest.fn().mockResolvedValue(undefined),
    getAccessForUserInOrganization: jest
      .fn()
      .mockResolvedValue({ roleKeys: [], permissions: [], portal: 'none' }),
  } as unknown as AuthorizationService;
  const tenantContext = {
    run: jest.fn((_context: unknown, callback: () => unknown) => callback()),
  } as unknown as TenantContextService;

  return {
    service: new AccountService(
      organizationService,
      clientService,
      authService,
      authorization,
      tenantContext,
    ),
    organizationService,
    clientService,
    authService,
    authorization,
    tenantContext,
  };
};

describe('AccountService', () => {
  describe('signUp', () => {
    it('founds a new workspace and marks the admin as its creator', async () => {
      const { service, organizationService, authService, authorization } = buildService();

      const result = await service.signUp({
        organizationName: 'Acme LLC',
        email: 'admin@acme.test',
        password: 'password123',
      });

      expect(authService.hasCreatedWorkspace).toHaveBeenCalledWith('admin@acme.test');
      expect(organizationService.create).toHaveBeenCalledWith({ legalName: 'Acme LLC' });
      expect(authService.createUser).toHaveBeenCalledWith({
        email: 'admin@acme.test',
        password: 'password123',
        isWorkspaceCreator: true,
      });
      expect(authorization.assignSystemRole).toHaveBeenCalledWith(USER, 'clientAdmin');
      expect(result.token).toBe('token');
    });

    it('rejects when this email has already founded a workspace', async () => {
      const { service, authService, organizationService } = buildService();
      (authService.hasCreatedWorkspace as jest.Mock).mockResolvedValue(true);

      await expect(
        service.signUp({
          organizationName: 'Someone Else LLC',
          email: 'admin@acme.test',
          password: 'password123',
        }),
      ).rejects.toThrow(/already created a workspace/);
      expect(organizationService.create).not.toHaveBeenCalled();
    });
  });

  describe('onboardClient', () => {
    it('founds a new client and workspace, seeding a client admin plus a tethrAdmin', async () => {
      const { service, organizationService, clientService, authService, authorization, tenantContext } =
        buildService();

      const result = await service.onboardClient({
        legalName: 'Acme LLC',
        displayName: 'Acme',
        defaultLocale: 'en',
        defaultCurrency: 'USD',
        adminEmail: 'admin@acme.test',
        adminPassword: 'password123',
        hrAdminEmail: 'hr@tethrhq.test',
        hrAdminPassword: 'password456',
      });

      expect(clientService.create).toHaveBeenCalledWith({ name: 'Acme LLC' });
      expect(result.client.id).toBe(CLIENT);
      expect(result.workspace.id).toBe(ORGANIZATION);
      expect(result.initialHrAdmin.id).toBe(HR_ADMIN_USER);
      expect(organizationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'client', legalName: 'Acme LLC', clientId: CLIENT }),
      );
      expect(tenantContext.run).toHaveBeenCalledWith(
        { organizationId: ORGANIZATION, userId: null },
        expect.any(Function),
      );
      expect(authService.createUser).toHaveBeenNthCalledWith(1, {
        email: 'admin@acme.test',
        password: 'password123',
        isWorkspaceCreator: true,
      });
      expect(authService.createUser).toHaveBeenNthCalledWith(2, {
        email: 'hr@tethrhq.test',
        password: 'password456',
      });
      expect(authorization.assignSystemRole).toHaveBeenCalledWith(USER, 'clientAdmin');
      expect(authorization.assignSystemRole).toHaveBeenCalledWith(HR_ADMIN_USER, 'tethrAdmin');
    });

    it('adds a workspace to an existing client instead of founding a new one', async () => {
      const { service, organizationService, clientService } = buildService();

      await service.onboardClient({
        clientId: CLIENT,
        legalName: 'Acme EU',
        adminEmail: 'admin@acme.test',
        adminPassword: 'password123',
        hrAdminEmail: 'hr@tethrhq.test',
        hrAdminPassword: 'password456',
      });

      expect(clientService.getById).toHaveBeenCalledWith(CLIENT);
      expect(clientService.create).not.toHaveBeenCalled();
      expect(organizationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: CLIENT }),
      );
    });
  });

  it('logs in directly when exactly one workspace verifies', async () => {
    const { service, authService, authorization } = buildService();
    (authService.findVerifiedUsers as jest.Mock).mockResolvedValue([adminUser]);

    const outcome = await service.login('admin@acme.test', 'password123');

    expect(outcome.kind).toBe('authenticated');
    if (outcome.kind !== 'authenticated') throw new Error('expected authenticated outcome');
    expect(outcome.token).toBe('token');
    expect(authorization.getAccessForUserInOrganization).toHaveBeenCalledWith(
      adminUser.id,
      adminUser.organizationId,
    );
  });

  it('returns a workspace selection when the same email verifies in more than one org', async () => {
    const { service, authService, organizationService } = buildService();
    (authService.findVerifiedUsers as jest.Mock).mockResolvedValue([adminUser, hrAdminUser]);

    const outcome = await service.login('shared@tethrhq.test', 'password123');

    expect(outcome.kind).toBe('selectWorkspace');
    if (outcome.kind !== 'selectWorkspace') throw new Error('expected selectWorkspace outcome');
    expect(outcome.selectionToken).toBe('selection-token');
    expect(outcome.workspaces).toEqual([
      { organizationId: ORGANIZATION, organizationName: 'Acme' },
      { organizationId: ORGANIZATION, organizationName: 'Acme' },
    ]);
    expect(organizationService.getById).toHaveBeenCalledTimes(2);
  });
});
