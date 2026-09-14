import { toId, type FormId, type OrganizationId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UnauthenticatedError } from '../../common/errors';
import { ConfigService } from '../config/config.service';

import type { FormLinkClaims } from './jwt-claims';

export type FormLinkTarget = {
  readonly formId: FormId;
  readonly organizationId: OrganizationId;
  readonly refId?: string | null;
};

export type VerifiedFormLink = FormLinkTarget & {
  readonly refId: string | null;
};

// Mints and verifies the signed links that carry an anonymous visitor to a
// public form. Modelled on the workspace-selection token: same secret, no
// `sub`/`org`, and the `type` discriminator is checked on the way back in — so
// a form link is single-purpose and can never be replayed as a session.
@Injectable()
export class FormTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  mint(target: FormLinkTarget): string {
    const claims: FormLinkClaims = {
      type: 'form-link',
      formId: target.formId,
      organizationId: target.organizationId,
      ...(target.refId ? { refId: target.refId } : {}),
    };
    return this.jwtService.sign(claims, {
      expiresIn: `${this.config.get('FORM_LINK_TTL_DAYS')}d`,
    });
  }

  verify(token: string): VerifiedFormLink {
    let claims: Partial<FormLinkClaims>;
    try {
      claims = this.jwtService.verify<Partial<FormLinkClaims>>(token);
    } catch {
      throw new UnauthenticatedError('This form link is invalid or has expired');
    }
    if (
      claims.type !== 'form-link' ||
      typeof claims.formId !== 'string' ||
      typeof claims.organizationId !== 'string'
    ) {
      throw new UnauthenticatedError('This form link is invalid or has expired');
    }
    return {
      formId: toId<FormId>(claims.formId),
      organizationId: toId<OrganizationId>(claims.organizationId),
      refId: typeof claims.refId === 'string' ? claims.refId : null,
    };
  }
}
