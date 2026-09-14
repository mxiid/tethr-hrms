import type { ApprovalStatus, UserId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../common/errors';
import { TenantScopedRepository } from '../tenancy/tenant-scoped.repository';

import { ApprovalRequest } from './approval-request.entity';
import { APPROVAL_REQUEST_REPOSITORY } from './workflow.tokens';


type RequestApprovalInput = {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly requestedByUserId: UserId;
};

type ApprovalDecision = Extract<ApprovalStatus, 'approved' | 'rejected'>;

// The single approval engine other modules configure (plan.md §4.1). Leave,
// expenses, etc. request approvals through this published interface rather than
// each rolling their own. Foundation skeleton — chains/steps/escalation layer in
// behind this method surface without changing callers.
@Injectable()
export class WorkflowService {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY)
    private readonly approvals: TenantScopedRepository<ApprovalRequest>,
  ) {}

  requestApproval(input: RequestApprovalInput): Promise<ApprovalRequest> {
    const request = this.approvals.create({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requestedByUserId: input.requestedByUserId,
      status: 'pending',
    });
    return this.approvals.save(request);
  }

  async decide(
    id: string,
    decidedByUserId: UserId,
    decision: ApprovalDecision,
    note?: string,
  ): Promise<ApprovalRequest> {
    const request = await this.approvals.findById(id);
    if (!request) {
      throw new NotFoundError('Approval request not found', { id });
    }
    request.status = decision;
    request.decidedByUserId = decidedByUserId;
    request.decisionNote = note ?? null;
    return this.approvals.save(request);
  }
}
