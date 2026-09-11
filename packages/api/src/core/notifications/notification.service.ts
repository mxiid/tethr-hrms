import type { UserId } from '@hrms/shared';
import { Injectable, Logger } from '@nestjs/common';


type NotificationChannel = 'email' | 'inApp' | 'push' | 'sms';

type SendNotificationInput = {
  readonly channel: NotificationChannel;
  readonly recipientUserId: UserId;
  readonly templateKey: string;
  readonly data?: Record<string, unknown>;
};

// Published interface for sending notifications. Foundation skeleton — it records
// intent. Real delivery (per-channel providers, templating, user preferences,
// delivery tracking) layers in behind this method without changing callers.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async send(input: SendNotificationInput): Promise<void> {
    this.logger.log(
      `notify ${input.channel} -> user ${input.recipientUserId} (template: ${input.templateKey})`,
    );
    return Promise.resolve();
  }
}
