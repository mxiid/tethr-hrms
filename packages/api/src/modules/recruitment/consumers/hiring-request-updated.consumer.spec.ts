import type { DomainEvent } from '@hrms/shared';
import { toId, type HiringRequestId, type OrganizationId } from '@hrms/shared';
import type { EntityManager } from 'typeorm';

import type { EventBus } from '../../../core/events/event-bus.service';
import type { IdempotencyService } from '../../../core/events/idempotency.service';
import type { NotificationService } from '../../../core/notifications/notification.service';
import type { PlatformScopeService } from '../../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { HiringRequestUpdatedConsumer } from './hiring-request-updated.consumer';
import type { RecruitmentService } from '../recruitment.service';

const CLIENT = toId<OrganizationId>('org-client');
const TETHR = toId<OrganizationId>('org-tethr');
const REQUEST = toId<HiringRequestId>('request-1');

const buildConsumer = (status: string, currentStatus: string = status) => {
  let handler: ((event: DomainEvent) => Promise<void>) | null = null;
  const eventBus = {
    register: jest.fn((_name: string, next: (event: DomainEvent) => Promise<void>) => {
      handler = next;
    }),
  } as unknown as EventBus;
  const manager = { id: 'manager' } as unknown as EntityManager;
  const idempotency = {
    runOnce: jest.fn(
      (_name: string, _event: DomainEvent, work: (manager: EntityManager) => Promise<unknown>) =>
        work(manager),
    ),
  } as unknown as IdempotencyService;
  const notifications = { sendSlack: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  const platformScope = {
    resolveTethrOrganizationId: jest.fn().mockResolvedValue(TETHR),
  } as unknown as PlatformScopeService;
  const recruitment = {
    // The service returns the freshest request; every decision follows it.
    reconcilePositionForRequest: jest
      .fn()
      .mockImplementation(async () => ({ id: REQUEST, status: currentStatus })),
    unpublishPostingsForRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as RecruitmentService;
  const visitedTenants: string[] = [];
  const tenantContext = {
    run: jest.fn((context: { organizationId: string }, work: () => Promise<unknown>) => {
      visitedTenants.push(context.organizationId);
      return work();
    }),
  } as unknown as TenantContextService;

  const consumer = new HiringRequestUpdatedConsumer(
    eventBus,
    idempotency,
    notifications,
    platformScope,
    recruitment,
    tenantContext,
  );
  consumer.onModuleInit();
  const event = {
    eventId: 'event-1',
    name: 'hiringRequest.updated',
    tenantId: CLIENT,
    occurredAt: new Date().toISOString(),
    version: 1,
    payload: { hiringRequestId: REQUEST, status, positionTitle: 'Senior developer' },
  } as DomainEvent;

  return {
    consumer,
    recruitment,
    notifications,
    visitedTenants,
    dispatch: () => {
      if (!handler) throw new Error('consumer did not register a handler');
      return handler(event);
    },
  };
};

describe('HiringRequestUpdatedConsumer', () => {
  it('reconciles the position in the request workspace and unpublishes in the operator workspace', async () => {
    const { dispatch, recruitment, notifications, visitedTenants } = buildConsumer('cancelled');

    await dispatch();

    expect(recruitment.reconcilePositionForRequest).toHaveBeenCalledWith(REQUEST, expect.anything());
    expect(recruitment.unpublishPostingsForRequest).toHaveBeenCalledWith(REQUEST, expect.anything());
    // Position reconcile runs under the request's tenant; the unpublish runs
    // under the operator's, because that is where postings live.
    expect(visitedTenants).toEqual([CLIENT, TETHR]);
    expect(notifications.sendSlack).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'hiringRequestUpdated' }),
    );
  });

  it('reconciles the position on a resume but leaves the posting alone', async () => {
    const { dispatch, recruitment, notifications, visitedTenants } = buildConsumer('open');

    await dispatch();

    // A resume from onHold must repair a frozen position; only held/terminal
    // statuses take the posting down, so no operator-workspace step happens.
    expect(recruitment.reconcilePositionForRequest).toHaveBeenCalledWith(REQUEST, expect.anything());
    expect(recruitment.unpublishPostingsForRequest).not.toHaveBeenCalled();
    expect(visitedTenants).toEqual([CLIENT]);
    expect(notifications.sendSlack).toHaveBeenCalled();
  });

  it('a stale held event cannot unpublish a request that is open again', async () => {
    // The held event failed once and was retried after the resume landed; the
    // request's current state, not the event's, decides the cleanup.
    const { dispatch, recruitment, notifications, visitedTenants } = buildConsumer(
      'onHold',
      'open',
    );

    await dispatch();

    expect(recruitment.reconcilePositionForRequest).toHaveBeenCalledWith(REQUEST, expect.anything());
    expect(recruitment.unpublishPostingsForRequest).not.toHaveBeenCalled();
    expect(visitedTenants).toEqual([CLIENT]);
    // Announcing "now onHold" after the open notice would be wrong.
    expect(notifications.sendSlack).not.toHaveBeenCalled();
  });
});
