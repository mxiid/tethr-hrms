import { toId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource, EntityManager } from 'typeorm';

import { ConflictError, NotFoundError } from '../../common/errors';
import type { TenantContextService } from '../tenancy/tenant-context.service';

import { WorkflowService } from './workflow.service';

const ORG = toId<OrganizationId>('org-1');
const APPROVER = toId<UserId>('user-1');

const buildService = () => {
  const execute = jest.fn();
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute,
  };
  const repository = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 'approval-1', ...value }),
    ),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const manager = {
    getRepository: jest.fn(() => repository),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORG),
  } as unknown as TenantContextService;

  const service = new WorkflowService(dataSource, tenantContext);
  return { service, manager, dataSource, repository, queryBuilder, execute };
};

describe('WorkflowService.requestApproval', () => {
  it('creates a pending request stamped with the current tenant', async () => {
    const { service, dataSource, repository } = buildService();

    await service.requestApproval({
      subjectType: 'leave_request',
      subjectId: 'lr-1',
      requestedByUserId: APPROVER,
    });

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        subjectType: 'leave_request',
        subjectId: 'lr-1',
        status: 'pending',
      }),
    );
    expect(repository.save).toHaveBeenCalled();
  });
});

describe('WorkflowService.decide', () => {
  it('decides a pending request through a status-conditional update', async () => {
    const { service, dataSource, queryBuilder, execute, repository } = buildService();
    execute.mockResolvedValue({ affected: 1 });
    repository.findOne.mockResolvedValue({ id: 'approval-1', status: 'approved' });

    const result = await service.decide('approval-1', APPROVER, 'approved', 'looks good');

    expect(result.status).toBe('approved');
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        decidedByUserId: APPROVER,
        decisionNote: 'looks good',
        decidedAt: expect.any(Date),
      }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :pending', { pending: 'pending' });
  });

  it('rejects a second decision with a conflict', async () => {
    const { service, execute, repository } = buildService();
    execute.mockResolvedValue({ affected: 0 });
    repository.findOne.mockResolvedValue({ id: 'approval-1', status: 'approved' });

    await expect(service.decide('approval-1', APPROVER, 'rejected')).rejects.toThrow(ConflictError);
  });

  it('throws not found when the request does not exist', async () => {
    const { service, execute, repository } = buildService();
    execute.mockResolvedValue({ affected: 0 });
    repository.findOne.mockResolvedValue(null);

    await expect(service.decide('missing', APPROVER, 'approved')).rejects.toThrow(NotFoundError);
  });

  it('joins the caller transaction when a manager is supplied', async () => {
    const { service, manager, dataSource, execute, repository } = buildService();
    execute.mockResolvedValue({ affected: 1 });
    repository.findOne.mockResolvedValue({ id: 'approval-1', status: 'approved' });

    await service.decide('approval-1', APPROVER, 'approved', undefined, manager);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalled();
  });
});
