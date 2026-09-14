import { toId, type OrganizationId, type UserId } from '@hrms/shared';
import { JwtService } from '@nestjs/jwt';

import { TenantContextMiddleware } from './tenant-context.middleware';
import type { TenantContextService } from './tenant-context.service';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const ORGANIZATION = toId<OrganizationId>('org-1');
const USER = toId<UserId>('user-1');

const buildMiddleware = (): {
  middleware: TenantContextMiddleware;
  run: jest.Mock;
  jwtService: JwtService;
} => {
  const run = jest.fn((_context: unknown, callback: () => unknown) => callback());
  const tenantContext = { run } as unknown as TenantContextService;
  const jwtService = new JwtService({ secret: SECRET });
  return { middleware: new TenantContextMiddleware(tenantContext, jwtService), run, jwtService };
};

describe('TenantContextMiddleware', () => {
  it('establishes tenant + principal from a session bearer token', () => {
    const { middleware, run, jwtService } = buildMiddleware();
    const token = jwtService.sign({ sub: USER, org: ORGANIZATION, email: 'user@example.com' });
    const next = jest.fn();

    middleware.use({ headers: { authorization: `Bearer ${token}` } }, undefined, next);

    expect(run).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION, userId: USER },
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it('never promotes a form-link token to a session, even with the right secret', () => {
    const { middleware, run, jwtService } = buildMiddleware();
    const token = jwtService.sign(
      { type: 'form-link', formId: 'form-1', organizationId: ORGANIZATION },
      { expiresIn: '30d' },
    );
    const next = jest.fn();

    middleware.use({ headers: { authorization: `Bearer ${token}` } }, undefined, next);

    expect(run).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('ignores an x-organization-id header — the tenant hole is closed', () => {
    const { middleware, run } = buildMiddleware();
    const next = jest.fn();

    middleware.use({ headers: { 'x-organization-id': ORGANIZATION } }, undefined, next);

    expect(run).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
