import { toId, type OrganizationId, type UserId } from '@hrms/shared';
import type { DataSource } from 'typeorm';

import type { AuthService } from '../../core/auth/auth.service';
import type { PlatformScopeService } from '../../core/tenancy/platform-scope.service';
import type { TenantContextService } from '../../core/tenancy/tenant-context.service';
import type { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import type { Application } from './entities/application.entity';
import type { InterviewFeedbackSkill } from './entities/interview-feedback-skill.entity';
import type { InterviewFeedback } from './entities/interview-feedback.entity';
import type { InterviewPanelMember } from './entities/interview-panel-member.entity';
import type { InterviewRound } from './entities/interview-round.entity';
import type { Interview } from './entities/interview.entity';
import type { JobPosting } from './entities/job-posting.entity';
import { InterviewService } from './interview.service';

const ORGANIZATION = toId<OrganizationId>('org-1');
const USER = toId<UserId>('user-1');
const INTERVIEW_ID = 'interview-1';
const PANEL_ID = 'panel-1';

type Options = {
  interview?: Partial<Interview>;
  panelMember?: Partial<InterviewPanelMember>;
  activeFeedback?: Partial<InterviewFeedback> | null;
};

const buildService = (options: Options = {}) => {
  const interview = {
    id: INTERVIEW_ID,
    organizationId: ORGANIZATION,
    applicationId: 'application-1',
    interviewRoundId: 'round-1',
    scheduledAt: new Date(Date.now() - 60_000),
    status: 'scheduled',
    outcome: null,
    notes: null,
    scheduledByUserId: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options.interview,
  } as Interview;
  const rounds = {
    find: jest.fn().mockResolvedValue([
      { id: 'round-1', name: 'Technical', skills: ['Technical depth'], orderIndex: 1 },
    ]),
    findById: jest.fn().mockResolvedValue({
      id: 'round-1',
      name: 'Technical',
      skills: ['Technical depth'],
      orderIndex: 1,
    }),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: 'round-1', ...value })),
  } as unknown as TenantScopedRepository<InterviewRound>;
  const interviews = {
    find: jest.fn().mockResolvedValue([interview]),
    findById: jest.fn().mockResolvedValue(interview),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ ...value, id: INTERVIEW_ID })),
  } as unknown as TenantScopedRepository<Interview>;
  const panel = {
    find: jest.fn().mockResolvedValue([
      { id: PANEL_ID, interviewId: INTERVIEW_ID, userId: null, externalName: 'Priya', externalEmail: null },
    ]),
    findById: jest.fn().mockResolvedValue({
      id: PANEL_ID,
      interviewId: INTERVIEW_ID,
      userId: null,
      externalName: 'Priya',
      externalEmail: null,
      ...options.panelMember,
    }),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<InterviewPanelMember>;
  const feedbacks = {
    find: jest.fn().mockResolvedValue(options.activeFeedback === null ? [] : [options.activeFeedback ?? { id: 'fb-old', withdrawnAt: new Date() }]),
    findById: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) => Promise.resolve({ id: 'fb-1', ...value })),
  } as unknown as TenantScopedRepository<InterviewFeedback>;
  const feedbackSkills = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<InterviewFeedbackSkill>;
  const applications = {
    findById: jest.fn().mockResolvedValue({
      id: 'application-1',
      stage: 'shortlisted',
      candidateId: 'candidate-1',
      jobPostingId: 'posting-1',
    }),
    find: jest.fn().mockResolvedValue([
      { id: 'application-1', candidateId: 'candidate-1', jobPostingId: 'posting-1' },
    ]),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  } as unknown as TenantScopedRepository<Application>;
  const postings = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as TenantScopedRepository<JobPosting>;
  const auth = {
    getUserById: jest.fn().mockResolvedValue({ id: USER, email: 'interviewer@tethr.test' }),
  } as unknown as AuthService;
  const platformScope = {
    resolveTethrOrganizationId: jest.fn().mockResolvedValue(ORGANIZATION),
  } as unknown as PlatformScopeService;
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue(ORGANIZATION),
  } as unknown as TenantContextService;
  const manager = {
    findOne: jest.fn().mockResolvedValue({
      id: 'application-1',
      stage: 'shortlisted',
      outcome: 'active',
      candidateId: 'candidate-1',
      jobPostingId: 'posting-1',
    }),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  };
  const dataSource = {
    transaction: jest.fn((callback: (transactionManager: typeof manager) => Promise<unknown>) =>
      callback(manager),
    ),
  } as unknown as DataSource;

  return {
    service: new InterviewService(
      rounds,
      interviews,
      panel,
      feedbacks,
      feedbackSkills,
      applications,
      postings,
      auth,
      platformScope,
      tenantContext,
      dataSource,
    ),
    rounds,
    interviews,
    panel,
    feedbacks,
    feedbackSkills,
    applications,
    manager,
  };
};

describe('InterviewService', () => {
  it('seeds the default round templates once', async () => {
    const { service, rounds } = buildService();
    (rounds.find as jest.Mock).mockResolvedValueOnce([]);

    const created = await service.ensureDefaultRounds();

    expect(created).toHaveLength(3);
    expect(rounds.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Screening call', orderIndex: 1 }),
    );

    (rounds.find as jest.Mock).mockResolvedValue([{ id: 'r1' }]);
    await service.ensureDefaultRounds();
    expect(rounds.create).toHaveBeenCalledTimes(3);
  });

  it('schedules with a panel and moves the application into interviewing', async () => {
    const { service, applications, panel } = buildService();

    await service.schedule({
      applicationId: 'application-1',
      interviewRoundId: 'round-1',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      panel: [{ externalName: 'Priya', externalEmail: 'priya@client.test' }],
      scheduledByUserId: USER,
    });

    expect(panel.save).toHaveBeenCalledWith(
      expect.objectContaining({ externalName: 'Priya', userId: null }),
    );
    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'interviewing' }),
    );
  });

  it('a failed interview ends the application rejected', async () => {
    const { service, manager } = buildService();
    (manager.findOne as jest.Mock).mockResolvedValue({
      id: 'application-1',
      stage: 'interviewing',
      outcome: 'active',
    });

    await service.updateStatus({
      interviewId: INTERVIEW_ID,
      status: 'completed',
      outcome: 'failed',
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'application-1', outcome: 'rejected' }),
    );
  });

  it('rejects a panel member that is not on the interview', async () => {
    const { service, panel } = buildService({
      panelMember: { interviewId: 'other-interview' },
    });

    await expect(
      service.recordFeedback({
        interviewId: INTERVIEW_ID,
        panelMemberId: PANEL_ID,
        scores: [{ skill: 'Technical depth', score: 4 }],
        recordedByUserId: USER,
      }),
    ).rejects.toThrow('not on this interview');
    expect(panel.findById).toHaveBeenCalled();
  });

  it('refuses feedback before the scheduled time', async () => {
    const { service } = buildService({
      interview: { scheduledAt: new Date(Date.now() + 3_600_000) },
    });

    await expect(
      service.recordFeedback({
        interviewId: INTERVIEW_ID,
        panelMemberId: PANEL_ID,
        scores: [{ skill: 'Technical depth', score: 4 }],
        recordedByUserId: USER,
      }),
    ).rejects.toThrow('before the interview takes place');
  });

  it('refuses a second active scorecard for the same panellist', async () => {
    const { service } = buildService({
      activeFeedback: { id: 'fb-active', panelMemberId: PANEL_ID, withdrawnAt: null },
    });

    await expect(
      service.recordFeedback({
        interviewId: INTERVIEW_ID,
        panelMemberId: PANEL_ID,
        scores: [{ skill: 'Technical depth', score: 4 }],
        recordedByUserId: USER,
      }),
    ).rejects.toThrow('withdraw it to refile');
  });

  it('files a scorecard after a previous one was withdrawn', async () => {
    const { service, feedbacks, feedbackSkills } = buildService();

    const feedback = await service.recordFeedback({
      interviewId: INTERVIEW_ID,
      panelMemberId: PANEL_ID,
      scores: [
        { skill: 'Technical depth', score: 5 },
        { skill: 'Communication', score: 3 },
      ],
      overallNote: 'Strong.',
      recordedByUserId: USER,
    });

    expect(feedback.id).toBe('fb-1');
    expect(feedbacks.save).toHaveBeenCalledWith(
      expect.objectContaining({ withdrawnAt: null, recordedByUserId: USER }),
    );
    expect(feedbackSkills.save).toHaveBeenCalledTimes(2);
  });

  it('computes per-skill and overall averages from the rated scorecards', async () => {
    const { service, feedbacks, feedbackSkills, rounds } = buildService();
    (rounds.find as jest.Mock).mockResolvedValue([
      { id: 'round-1', name: 'Technical', skills: ['Technical depth', 'Communication'] },
    ]);
    (feedbacks.find as jest.Mock).mockResolvedValue([
      { id: 'fb-1', interviewId: INTERVIEW_ID, panelMemberId: PANEL_ID, withdrawnAt: null },
    ]);
    (feedbackSkills.find as jest.Mock).mockResolvedValue([
      { feedbackId: 'fb-1', skill: 'Technical depth', score: 4 },
      { feedbackId: 'fb-1', skill: 'Communication', score: 2 },
    ]);

    const [detail] = await service.listInterviews();

    expect(detail.average).toBe(3);
    expect(detail.skillAverages).toEqual([
      { skill: 'Technical depth', average: 4 },
      { skill: 'Communication', average: 2 },
    ]);
  });
});
