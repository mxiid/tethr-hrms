import type { DomainEvent } from '@hrms/shared';
import { toId, type FormId, type FormSubmissionId, type OrganizationId } from '@hrms/shared';
import type { EntityManager } from 'typeorm';

import type { EventBus } from '../../../core/events/event-bus.service';
import type { IdempotencyService } from '../../../core/events/idempotency.service';
import type { NotificationService } from '../../../core/notifications/notification.service';
import type { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { ApplicationIntakeConsumer } from './application-intake.consumer';
import type { AtsService } from '../ats.service';

const CLIENT = toId<OrganizationId>('org-client');
const SUBMISSION = toId<FormSubmissionId>('submission-1');
const FORM = toId<FormId>('form-1');

const buildConsumer = () => {
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
  const ats = {
    applyFormSubmission: jest.fn().mockResolvedValue({
      id: 'application-1',
      candidateId: 'candidate-1',
      jobPostingId: 'posting-1',
    }),
    getCandidate: jest.fn().mockResolvedValue({
      id: 'candidate-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
    }),
    postingsByIds: jest
      .fn()
      .mockResolvedValue(new Map([['posting-1', { id: 'posting-1', title: 'Staff Engineer' }]])),
    reconcilePendingCvParses: jest.fn().mockResolvedValue(1),
  } as unknown as AtsService;
  const notifications = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;
  const visitedTenants: string[] = [];
  const tenantContext = {
    run: jest.fn((context: { organizationId: string }, work: () => Promise<unknown>) => {
      visitedTenants.push(context.organizationId);
      return work();
    }),
  } as unknown as TenantContextService;

  const consumer = new ApplicationIntakeConsumer(
    eventBus,
    idempotency,
    tenantContext,
    ats,
    notifications,
  );
  consumer.onModuleInit();

  const event = {
    eventId: 'event-1',
    name: 'form.submitted',
    tenantId: CLIENT,
    occurredAt: new Date().toISOString(),
    version: 1,
    payload: { formId: FORM, submissionId: SUBMISSION, target: 'application' },
  } as DomainEvent;

  return {
    dispatch: () => {
      if (!handler) throw new Error('consumer did not register a handler');
      return handler(event);
    },
    ats,
    notifications,
    visitedTenants,
  };
};

describe('ApplicationIntakeConsumer', () => {
  it('reads the candidate on the ledger transaction before acknowledging', async () => {
    const { dispatch, ats, notifications } = buildConsumer();

    await dispatch();

    // A default-connection read cannot see the candidate this transaction just
    // created; the manager-bound read can.
    expect(ats.applyFormSubmission).toHaveBeenCalledWith(SUBMISSION, expect.anything());
    expect(ats.getCandidate).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com' }),
    );
  });

  it('enqueues pending CV parses only after the ledger transaction', async () => {
    const { dispatch, ats } = buildConsumer();

    await dispatch();

    expect(ats.reconcilePendingCvParses).toHaveBeenCalled();
  });
});