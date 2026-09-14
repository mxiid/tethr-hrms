import type { OrganizationKind, WorkspaceBrandColor } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../core/database/entities/base.entity';

// The tenant root. An Organization is NOT tenant-scoped — it IS the tenant; its
// `id` is the organizationId every other row carries. Everything else in the
// system hangs off this (plan.md §3).
@Entity('organizations')
// There is exactly one platform (Tethr) workspace; the partial index makes that
// a database invariant rather than a convention (only 'tethr' rows are indexed).
@Index('organizations_single_tethr_workspace', ['kind'], {
  unique: true,
  where: `"kind" = 'tethr'`,
})
export class Organization extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'client' })
  kind!: OrganizationKind;

  @Column({ type: 'varchar', length: 256 })
  legalName!: string;

  @Column({ type: 'varchar', length: 256 })
  displayName!: string;

  // Normalized (lowercase, punctuation-stripped) form of legalName — never
  // shown in the UI, exists purely to enforce workspace-name uniqueness
  // (like a Slack team name) without a functional LOWER() index, which
  // wouldn't survive DATABASE_SYNCHRONIZE=true schema sync in dev.
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  // ID-only reference to the Client this workspace belongs to (modules/clients)
  // — null for Tethr's own internal workspace. Deliberately not a DB foreign
  // key (non-negotiable #2: no cross-module FKs).
  @Index()
  @Column({ type: 'uuid', nullable: true })
  clientId!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'en' })
  defaultLocale!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  defaultCurrency!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings!: Record<string, unknown>;

  // Auto-assigned at creation, user-configurable after (see
  // WORKSPACE_BRAND_COLORS in @hrms/shared). Cosmetic only — never used for
  // identity or access decisions.
  @Column({ type: 'varchar', length: 16, default: 'iris' })
  brandColor!: WorkspaceBrandColor;
}
