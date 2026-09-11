import {
  toId,
  WORKSPACE_BRAND_COLORS,
  type OrganizationId,
  type OrganizationKind,
  type WorkspaceBrandColor,
} from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ConflictError, ValidationFailedError } from '../../common/errors';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';

import { Organization } from './entities/organization.entity';

type CreateOrganizationInput = {
  readonly legalName: string;
  readonly kind?: OrganizationKind;
  readonly displayName?: string;
  readonly defaultLocale?: string;
  readonly defaultCurrency?: string;
  readonly clientId?: string | null;
};

const randomBrandColor = (): WorkspaceBrandColor =>
  WORKSPACE_BRAND_COLORS[Math.floor(Math.random() * WORKSPACE_BRAND_COLORS.length)];

// Lowercase, punctuation-stripped, hyphen-collapsed — "Acme, Inc." and
// "acme inc" both normalize to "acme-inc" so name collisions are caught
// regardless of how a person happens to type/punctuate the same name.
const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Bootstrapping a tenant happens OUTSIDE any tenant scope (the tenant does not
  // exist yet). Create the org, then publish organization.created within the new
  // org's context, in the same transaction (transactional outbox).
  async create(input: CreateOrganizationInput): Promise<Organization> {
    const slug = slugify(input.legalName);
    return this.dataSource.transaction(async (manager) => {
      // Explicit precheck for a friendly error; the unique index on `slug`
      // is the safety net for the race between two concurrent signups with
      // the same name (workspace names are unique, like a Slack team name).
      const existing = await manager.count(Organization, { where: { slug } });
      if (existing > 0) {
        throw new ConflictError('That workspace name is already taken', {
          legalName: input.legalName,
        });
      }
      const organization = manager.create(Organization, {
        kind: input.kind ?? 'client',
        legalName: input.legalName,
        displayName: input.displayName ?? input.legalName,
        slug,
        clientId: input.clientId ?? null,
        defaultLocale: input.defaultLocale ?? 'en',
        defaultCurrency: input.defaultCurrency ?? 'USD',
        settings: {},
        brandColor: randomBrandColor(),
      });
      const saved = await manager.save(organization);
      const organizationId = toId<OrganizationId>(saved.id);
      await this.tenantContext.run({ organizationId, userId: null }, () =>
        this.publisher.publishWithin(manager, {
          name: 'organization.created',
          payload: { organizationId, legalName: saved.legalName },
        }),
      );
      return saved;
    });
  }

  getById(id: OrganizationId): Promise<Organization | null> {
    return this.organizations.findOne({ where: { id } });
  }

  findByClientId(clientId: string): Promise<Organization[]> {
    return this.organizations.find({ where: { clientId }, order: { createdAt: 'DESC' } });
  }

  async updateBrandColor(id: OrganizationId, brandColor: string): Promise<Organization> {
    if (!WORKSPACE_BRAND_COLORS.includes(brandColor as WorkspaceBrandColor)) {
      throw new ValidationFailedError('Unknown brand color', { brandColor });
    }
    const organization = await this.getById(id);
    if (!organization) {
      throw new ValidationFailedError('Organization not found', { id });
    }
    organization.brandColor = brandColor as WorkspaceBrandColor;
    return this.organizations.save(organization);
  }

  // Precheck for signup/onboarding: workspace names ARE unique (create()
  // enforces it), so this predicts the real constraint exactly — compares
  // the same normalized slug create() would compute, not the raw name, so
  // e.g. "Acme, Inc." correctly warns even if "acme inc" is what's taken.
  async legalNameExists(legalName: string): Promise<boolean> {
    const count = await this.organizations.count({ where: { slug: slugify(legalName) } });
    return count > 0;
  }
}
