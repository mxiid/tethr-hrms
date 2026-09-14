import type { FormTarget } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

export type FormDefinitionStatus = 'draft' | 'published';

// A form the workspace publishes (the application form is the first consumer).
// Slugs are unique per tenant; submissions attach to the definition, and the
// `target` says which entity a submission feeds (projection is a consumer).
@Entity('form_definitions')
@Index(['organizationId', 'slug'], { unique: true })
export class FormDefinition extends TenantScopedEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 200 })
  slug!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: FormDefinitionStatus;

  @Column({ type: 'varchar', length: 32, default: 'generic' })
  target!: FormTarget;
}
