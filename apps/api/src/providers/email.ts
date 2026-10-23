import { httpJson, type FetchLike } from '../lib/http.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface EmailProvider {
  readonly name: string;
  /** Resolves with the provider message id ONLY when the provider accepted the message. */
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/** Resend (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendProvider implements EmailProvider {
  readonly name = 'Resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl?: FetchLike,
  ) {}

  async send(msg: EmailMessage): Promise<{ id: string }> {
    const r = await httpJson<{ id?: string }>('https://api.resend.com/emails', {
      provider: this.name,
      retries: 1,
      fetchImpl: this.fetchImpl,
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers }),
      },
    });
    if (!r.id) throw new Error('Resend did not return a message id');
    return { id: r.id };
  }
}

/**
 * Development sink: records messages in memory so they can be previewed at GET /api/v1/dev/outbox (non-production only).
 * Deliveries through the sink are recorded with status "skipped" and reason "dev sink" — never "delivered".
 */
export class DevOutbox {
  readonly messages: (EmailMessage & { at: string })[] = [];
  push(m: EmailMessage) {
    this.messages.unshift({ ...m, at: new Date().toISOString() });
    this.messages.length = Math.min(this.messages.length, 50);
  }
}
