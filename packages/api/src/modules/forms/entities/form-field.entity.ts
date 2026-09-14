import type { FormFieldType } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// One field in a form. `mapsTo` is the projection seam: a stable semantic name
// (e.g. `candidate.email`, `application.coverNote`) the target consumer maps
// onto its own columns — so the exact columns a client uses stay configuration,
// not schema.
@Entity('form_fields')
@Index(['organizationId', 'formId', 'fieldKey'], { unique: true })
export class FormField extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  formId!: string;

  @Column({ type: 'varchar', length: 64 })
  fieldKey!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: FormFieldType;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  options!: string[];

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mapsTo!: string | null;

  @Column({ type: 'text', nullable: true })
  helpText!: string | null;
}
