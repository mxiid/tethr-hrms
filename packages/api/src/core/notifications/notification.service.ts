import type { UserId } from '@hrms/shared';
import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '../config/config.service';

import { LoggerEmailTransport, ResendEmailTransport, type EmailTransport } from './email.transport';
import { type NotificationTemplateKey, renderEmail, renderSlack } from './notification.templates';
import { LoggerSlackTransport, WebhookSlackTransport, type SlackTransport } from './slack.transport';

type NonEmailChannel = 'inApp' | 'push' | 'sms';

export type SendNotificationInput =
  | {
      readonly channel: 'email';
      readonly to: string;
      readonly templateKey: NotificationTemplateKey;
      readonly data?: Record<string, unknown>;
    }
  | {
      readonly channel: NonEmailChannel;
      readonly recipientUserId: UserId;
      readonly templateKey: string;
      readonly data?: Record<string, unknown>;
    };

export type SendSlackInput = {
  readonly templateKey: NotificationTemplateKey;
  readonly data?: Record<string, unknown>;
};

// Published interface for sending notifications: pick the transport from config
// at construction, so callers are provider-agnostic. Email and Slack deliver for
// real when credentials exist; without them the logger transports record intent
// (the dev default). In-app/push/sms remain recorded intents.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly emailTransport: EmailTransport;
  private readonly slackTransport: SlackTransport;

  constructor(config: ConfigService) {
    const apiKey = config.get('RESEND_API_KEY');
    const from = config.get('EMAIL_FROM');
    this.emailTransport =
      apiKey && from ? new ResendEmailTransport(apiKey, from) : new LoggerEmailTransport();

    const webhookUrl = config.get('SLACK_WEBHOOK_URL');
    this.slackTransport = webhookUrl
      ? new WebhookSlackTransport(webhookUrl)
      : new LoggerSlackTransport();
  }

  async send(input: SendNotificationInput): Promise<void> {
    if (input.channel === 'email') {
      const template = renderEmail(input.templateKey, input.data ?? {});
      await this.emailTransport.send({ to: input.to, ...template });
      return;
    }
    this.logger.log(
      `notify ${input.channel} -> user ${input.recipientUserId} (template: ${input.templateKey})`,
    );
  }

  async sendSlack(input: SendSlackInput): Promise<void> {
    await this.slackTransport.post(renderSlack(input.templateKey, input.data ?? {}));
  }
}
