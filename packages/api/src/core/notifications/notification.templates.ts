// Template registry. Templates are plain functions, not a template language:
// the set of notifications the product actually sends is small, and typed keys
// mean a typo is a compile error. Keys are shared across channels so an email
// and its Slack alert stay in one place.

export type NotificationTemplateKey = 'hiringRequestSubmitted' | 'applicationReceived';

export type EmailTemplate = {
  readonly subject: string;
  readonly text: string;
};

const text = (data: Readonly<Record<string, unknown>>, key: string, fallback: string): string =>
  typeof data[key] === 'string' && data[key] !== '' ? (data[key] as string) : fallback;

export const renderEmail = (
  templateKey: NotificationTemplateKey,
  data: Readonly<Record<string, unknown>>,
): EmailTemplate => {
  switch (templateKey) {
    case 'hiringRequestSubmitted':
      return {
        subject: `New hiring request: ${text(data, 'positionTitle', 'an untitled role')}`,
        text: [
          `A client submitted a new hiring request: "${text(data, 'positionTitle', 'an untitled role')}".`,
          '',
          `Request id: ${text(data, 'hiringRequestId', 'unknown')}`,
        ].join('\n'),
      };
    case 'applicationReceived':
      return {
        subject: `We received your application — ${text(data, 'positionTitle', 'the role')}`,
        text: [
          `Hi ${text(data, 'candidateName', 'there')},`,
          '',
          `Thanks for applying for ${text(data, 'positionTitle', 'the role')}. We have your details and CV, and the team will be in touch if there is a fit.`,
        ].join('\n'),
      };
  }
};

export const renderSlack = (
  templateKey: NotificationTemplateKey,
  data: Readonly<Record<string, unknown>>,
): string => {
  switch (templateKey) {
    case 'hiringRequestSubmitted':
      return `:briefcase: New hiring request: *${text(data, 'positionTitle', 'untitled role')}* (${text(data, 'hiringRequestId', 'unknown')})`;
    case 'applicationReceived':
      return `:inbox_tray: Application from *${text(data, 'candidateName', 'a candidate')}* for *${text(data, 'positionTitle', 'a role')}*`;
  }
};
