import type { UserId } from '@hrms/shared';
import { Column, Entity, Index } from 'typeorm';

import { TenantScopedEntity } from '../../../core/database/entities/tenant-scoped.entity';

// A panellist is either an internal user (by id) or an external person (name,
// optional email). This is where the model must diverge from Frappe: the people
// interviewing are usually the client's staff, who have no HRMS login at all.
@Entity('interview_panel_members')
@Index(['organizationId', 'interviewId'])
export class InterviewPanelMember extends TenantScopedEntity {
  @Column({ type: 'uuid' })
  interviewId!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: UserId | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  externalName!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  externalEmail!: string | null;
}
