import type { ApprovalStatus, UserId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { ConflictError, NotFoundError } from '../../common/errors';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { ApprovalRequest } from './approval-request.entity';


type RequestApprovalInput = {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly requestedByUserId: UserId;
};

type ApprovalDecision = Extract<ApprovalStatus, 'approved' | 'rejected' | 'cancelled'>;

// The single approval engine other modules configure (plan.md §4.1). Leave,
// expenses, etc. request approvals through this published interface rather than
// each rolling their own. Foundation skeleton — chains/steps/escalation layer in
// behind this method surface without changing callers.
//
// Every method takes an optional EntityManager so a caller can make the approval
// row part of its own business transaction (P1.3 leave, P1.10 expenses).
@Injectable()
export class WorkflowService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  requestApproval(
    input: RequestApprovalInput,
    manager?: EntityManager,
  ): Promise<ApprovalRequest> {
    const run = (entityManager: EntityManager): Promise<ApprovalRequest> => {
      const repository = entityManager.getRepository(ApprovalRequest);
      const request = repository.create({
        organizationId: this.tenantContext.getOrganizationId(),
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        requestedByUserId: input.requestedByUserId,
        status: 'pending',
      });
      return repository.save(request);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  // A conditional update is the guard AND the lock: only a row that is still
  // pending can transition, so concurrent decisions cannot both win and a second
  // decide is reported as a conflict instead of silently overwriting the first.
  decide(
    id: string,
    decidedByUserId: UserId | null,
    decision: ApprovalDecision,
    note?: string,
    manager?: EntityManager,
  ): Promise<ApprovalRequest> {
    const run = async (entityManager: EntityManager): Promise<ApprovalRequest> => {
      const repository = entityManager.getRepository(ApprovalRequest);
      const organizationId = this.tenantContext.getOrganizationId();

      const result = await repository
        .createQueryBuilder()
        .update(ApprovalRequest)
        .set({
          status: decision,
          decidedByUserId,
          decisionNote: note ?? null,
          decidedAt: new Date(),
        })
        .where('id = :id', { id })
        .andWhere('"organizationId" = :organizationId', { organizationId })
        .andWhere('status = :pending', { pending: 'pending' })
        .execute();

      if (!result.affected) {
        const existing = await repository.findOne({ where: { id, organizationId } });
        if (!existing) {
          throw new NotFoundError('Approval request not found', { id });
        }
        throw new ConflictError('Approval request has already been decided', {
          id,
          status: existing.status,
        });
      }

      const decided = await repository.findOne({ where: { id, organizationId } });
      if (!decided) {
        throw new NotFoundError('Approval request not found', { id });
      }
      return decided;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }
}
