import { toId, type OrganizationId, type UserId } from '@hrms/shared';

import { UnauthenticatedError } from '../../common/errors';
import type { TenantContextService } from '../tenancy/tenant-context.service';

import type { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

const ORGANIZATION = toId<OrganizationId>('organization-1');
const USER = toId<UserId>('user-1');

const buildGuard = (overrides: {
  readonly userId?: UserId | null;
  readonly resolveActiveSession?: jest.Mock;
}) => {
  const resolveActiveSession =
    overrides.resolveActiveSession ?? jest.fn().mockResolvedValue({ id: USER });
  const authService = { resolveActiveSession } as unknown as AuthService;
  const tenantContext = {
    getUserId: jest.fn().mockReturnValue('userId' in overrides ? overrides.userId : USER),
    getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION),
    getTokenVersion: jest.fn().mockReturnValue(0),
  } as unknown as TenantContextService;
  return { guard: new SessionGuard(authService, tenantContext), resolveActiveSession };
};

describe('SessionGuard', () => {
  it('passes anonymous requests through', async () => {
    const resolveActiveSession = jest.fn();
    const { guard } = buildGuard({ userId: null, resolveActiveSession });

    await expect(guard.canActivate()).resolves.toBe(true);
    expect(resolveActiveSession).not.toHaveBeenCalled();
  });

  it('passes a request whose session still resolves', async () => {
    const { guard, resolveActiveSession } = buildGuard({});

    await expect(guard.canActivate()).resolves.toBe(true);
    expect(resolveActiveSession).toHaveBeenCalledWith(USER, ORGANIZATION, 0);
  });

  it('rejects a request whose user is disabled or whose epoch moved', async () => {
    const { guard } = buildGuard({
      resolveActiveSession: jest.fn().mockResolvedValue(null),
    });

    await expect(guard.canActivate()).rejects.toThrow(UnauthenticatedError);
  });
});
