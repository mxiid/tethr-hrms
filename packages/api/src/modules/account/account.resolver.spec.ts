import type { PortalKind } from '@hrms/shared';

import { RateLimitedError } from '../../common/errors';
import type { User } from '../../core/auth/user.entity';
import type { AuthorizationService } from '../../core/authz/authz.service';
import type { ConfigService } from '../../core/config/config.service';
import { RateLimiterService } from '../../core/security/rate-limiter.service';

import { AccountResolver } from './account.resolver';
import type { AccountService } from './account.service';
import type { EmployeeLinkGuard } from './employee-link-guard.service';

const CLIENT: PortalKind = 'client';

const user = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'person@acme.test',
  status: 'active',
  employeeId: null,
} as User;

const buildResolver = (limits: { readonly ip: number; readonly email: number }) => {
  const accountService = {
    login: jest.fn().mockResolvedValue({
      kind: 'authenticated',
      token: 'token',
      user,
      access: { roleKeys: ['clientAdmin'], permissions: [], portal: CLIENT },
    }),
  } as unknown as AccountService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'AUTH_LOGIN_IP_LIMIT_PER_10_MIN' ? limits.ip : limits.email,
    ),
  } as unknown as ConfigService;
  const resolver = new AccountResolver(
    accountService,
    {} as AuthorizationService,
    {} as EmployeeLinkGuard,
    new RateLimiterService(),
    config,
  );
  return { resolver, accountService };
};

const context = { req: { ip: '203.0.113.9' } };

describe('AccountResolver login throttling', () => {
  it('applies the per-address admission limit before the per-email key', async () => {
    const { resolver, accountService } = buildResolver({ ip: 1, email: 10 });

    await resolver.login({ email: 'first@acme.test', password: 'x' }, context);
    await expect(
      resolver.login({ email: 'second@acme.test', password: 'x' }, context),
    ).rejects.toThrow(RateLimitedError);

    // The second attempt never reached password verification.
    expect(accountService.login).toHaveBeenCalledTimes(1);
  });

  it('still limits repeated attempts against one email', async () => {
    const { resolver, accountService } = buildResolver({ ip: 10, email: 1 });

    await resolver.login({ email: 'person@acme.test', password: 'x' }, context);
    await expect(
      resolver.login({ email: 'person@acme.test', password: 'x' }, context),
    ).rejects.toThrow(RateLimitedError);

    expect(accountService.login).toHaveBeenCalledTimes(1);
  });
});
