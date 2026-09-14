import { Logger } from '@nestjs/common';

import { ValidationFailedError } from '../../common/errors';

export interface SlackTransport {
  post(text: string): Promise<void>;
}

// Incoming-webhook delivery. Slack responds with "ok" (200) on success.
export class WebhookSlackTransport implements SlackTransport {
  private readonly logger = new Logger(WebhookSlackTransport.name);

  constructor(private readonly webhookUrl: string) {}

  async post(text: string): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The relay awaits consumers inline; a stalled webhook must fail the
      // delivery rather than freeze event processing.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ValidationFailedError('Slack delivery failed', {
        status: response.status,
        detail: detail.slice(0, 500),
      });
    }
    this.logger.log('Slack message delivered');
  }
}

// The dev/default transport: records intent without a webhook configured.
export class LoggerSlackTransport implements SlackTransport {
  private readonly logger = new Logger('SlackTransport');

  async post(text: string): Promise<void> {
    this.logger.log(`[dev] slack -> ${text}`);
    return Promise.resolve();
  }
}
