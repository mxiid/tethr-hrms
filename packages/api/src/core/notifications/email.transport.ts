import { Logger } from '@nestjs/common';

import { ValidationFailedError } from '../../common/errors';

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

// Resend over HTTP — one POST, no SDK. The API key is server-only; the web app
// never sees it (unlike a client-side email SDK).
export class ResendEmailTransport implements EmailTransport {
  private readonly logger = new Logger(ResendEmailTransport.name);

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      // The relay awaits consumers inline; a stalled provider must fail the
      // delivery rather than freeze event processing.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ValidationFailedError('Email delivery failed', {
        status: response.status,
        detail: detail.slice(0, 500),
      });
    }
    this.logger.log(`Email sent to ${message.to}`);
  }
}

// The dev/default transport: records intent without a provider configured, so
// the pipeline is exercisable end to end before credentials exist.
export class LoggerEmailTransport implements EmailTransport {
  private readonly logger = new Logger('EmailTransport');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[dev] email -> ${message.to}: ${message.subject}`);
    return Promise.resolve();
  }
}
