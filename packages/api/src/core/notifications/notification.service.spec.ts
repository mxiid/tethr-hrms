import { toId, type UserId } from '@hrms/shared';

import type { ConfigService } from '../config/config.service';

import { NotificationService } from './notification.service';

const buildConfig = (values: Record<string, unknown>): ConfigService =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('NotificationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to logger transports without credentials', async () => {
    const service = new NotificationService(buildConfig({}));

    await expect(
      service.send({
        channel: 'email',
        to: 'candidate@example.com',
        templateKey: 'hiringRequestSubmitted',
        data: { positionTitle: 'Engineer' },
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.sendSlack({
        templateKey: 'hiringRequestSubmitted',
        data: { positionTitle: 'Engineer', hiringRequestId: 'req-1' },
      }),
    ).resolves.toBeUndefined();
  });

  it('still records non-email in-app/push/sms intents', async () => {
    const service = new NotificationService(buildConfig({}));
    const userId = toId<UserId>('user-1');

    await expect(
      service.send({ channel: 'inApp', recipientUserId: userId, templateKey: 'anything' }),
    ).resolves.toBeUndefined();
  });

  it('delivers email through Resend when configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    const service = new NotificationService(
      buildConfig({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'hiring@tethr.test' }),
    );

    await service.send({
      channel: 'email',
      to: 'candidate@example.com',
      templateKey: 'hiringRequestSubmitted',
      data: { positionTitle: 'Senior Engineer', hiringRequestId: 'req-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer re_test' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      from: string;
      to: string[];
      subject: string;
    };
    expect(body.from).toBe('hiring@tethr.test');
    expect(body.to).toEqual(['candidate@example.com']);
    expect(body.subject).toContain('Senior Engineer');
  });

  it('delivers Slack through the incoming webhook when configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok',
    } as Response);
    const service = new NotificationService(
      buildConfig({ SLACK_WEBHOOK_URL: 'https://hooks.slack.test/abc' }),
    );

    await service.sendSlack({
      templateKey: 'hiringRequestSubmitted',
      data: { positionTitle: 'Designer', hiringRequestId: 'req-2' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/abc',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces a provider failure as a domain error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    } as Response);
    const service = new NotificationService(
      buildConfig({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'hiring@tethr.test' }),
    );

    await expect(
      service.send({ channel: 'email', to: 'a@b.test', templateKey: 'hiringRequestSubmitted' }),
    ).rejects.toThrow('Email delivery failed');
  });
});
