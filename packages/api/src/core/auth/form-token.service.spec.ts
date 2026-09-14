import { toId, type FormId, type OrganizationId } from '@hrms/shared';
import { JwtService } from '@nestjs/jwt';

import type { ConfigService } from '../config/config.service';

import { FormTokenService } from './form-token.service';
import type { JwtClaims, WorkspaceSelectionClaims } from './jwt-claims';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const FORM = toId<FormId>('form-1');
const ORGANIZATION = toId<OrganizationId>('org-1');

const buildService = (): { service: FormTokenService; jwtService: JwtService } => {
  const jwtService = new JwtService({ secret: SECRET });
  const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
  return { service: new FormTokenService(jwtService, config), jwtService };
};

describe('FormTokenService', () => {
  it('round-trips the form and workspace through a minted link', () => {
    const { service } = buildService();
    const token = service.mint({ formId: FORM, organizationId: ORGANIZATION });

    expect(service.verify(token)).toEqual({
      formId: FORM,
      organizationId: ORGANIZATION,
      refId: null,
    });
  });

  it('carries an optional context reference (the posting an application is for)', () => {
    const { service } = buildService();
    const token = service.mint({ formId: FORM, organizationId: ORGANIZATION, refId: 'posting-9' });

    expect(service.verify(token)).toEqual({
      formId: FORM,
      organizationId: ORGANIZATION,
      refId: 'posting-9',
    });
  });

  it('rejects a session token', () => {
    const { service, jwtService } = buildService();
    const sessionClaims: JwtClaims = { sub: 'user-1', org: 'org-1', email: 'user@example.com' };
    const token = jwtService.sign(sessionClaims);

    expect(() => service.verify(token)).toThrow('invalid or has expired');
  });

  it('rejects a workspace-selection token', () => {
    const { service, jwtService } = buildService();
    const selectionClaims: WorkspaceSelectionClaims = {
      type: 'workspace-selection',
      email: 'user@example.com',
      organizationIds: ['org-1'],
    };
    const token = jwtService.sign(selectionClaims, { expiresIn: '5m' });

    expect(() => service.verify(token)).toThrow('invalid or has expired');
  });

  it('rejects an expired link', () => {
    const { service, jwtService } = buildService();
    const token = jwtService.sign({
      type: 'form-link',
      formId: 'form-1',
      organizationId: 'org-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(() => service.verify(token)).toThrow('invalid or has expired');
  });
});
