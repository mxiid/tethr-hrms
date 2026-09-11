import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantContextService } from '../tenancy/tenant-context.service';

import { AuditEvent } from './audit-event.entity';

type AuditRecordInput = {
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly metadata?: Record<string, unknown> | null;
};

// Writes append-only audit events. Stamps the actor and tenant from context, so
// callers only describe the change — they cannot misattribute it.
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent) private readonly repository: Repository<AuditEvent>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const event = this.repository.create({
      organizationId: this.tenantContext.getOrganizationId(),
      actorUserId: this.tenantContext.getUserId(),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      occurredAt: new Date(),
    });
    await this.repository.save(event);
  }
}
