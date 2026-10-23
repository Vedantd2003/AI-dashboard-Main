import type { Types } from 'mongoose';
import type { Deps } from '../deps.js';
import { Notification, User } from '../models/index.js';

export type Channel = 'in_app' | 'email' | 'webhook';
type NotificationKind =
  | 'alert_triggered'
  | 'filing_detected'
  | 'brief_ready'
  | 'digest_ready'
  | 'workflow_failed'
  | 'provider_down'
  | 'new_source'
  | 'system';

export interface NotifyInput {
  userId: Types.ObjectId | string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
  /** Same (userId, dedupeKey) is stored and delivered at most once. */
  dedupeKey: string;
  channels?: Channel[];
}

interface Delivery {
  channel: Channel;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  attempts: number;
  providerMessageId: string | null;
  error: string | null;
  at: Date;
}

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

export class NotificationService {
  constructor(private readonly deps: Deps) {}

  /** Returns { created: false } when the dedupe key already exists — nothing is re-sent. */
  async notify(input: NotifyInput): Promise<{ created: boolean; id: string | null; deliveries: Delivery[] }> {
    const user = await User.findById(input.userId);
    if (!user) return { created: false, id: null, deliveries: [] };
    const channels = new Set<Channel>(input.channels ?? ['in_app']);
    channels.add('in_app');

    let doc;
    try {
      doc = await Notification.create({
        userId: user._id,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: (input.body ?? '').slice(0, 4000),
        link: input.link ?? null,
        dedupeKey: input.dedupeKey,
        deliveries: [],
      });
    } catch (e) {
      if (isDuplicateKey(e)) return { created: false, id: null, deliveries: [] };
      throw e;
    }

    const deliveries: Delivery[] = [];
    const now = () => this.deps.now();
    // In-app delivery IS the stored notification.
    deliveries.push({ channel: 'in_app', status: 'delivered', attempts: 1, providerMessageId: String(doc._id), error: null, at: now() });

    const prefs = user.notificationPrefs ?? ({} as NonNullable<typeof user.notificationPrefs>);
    if (channels.has('email')) deliveries.push(await this.deliverEmail(user.email, prefs.email ?? false, input));
    if (channels.has('webhook')) deliveries.push(await this.deliverWebhook(prefs.webhook ?? false, prefs.webhookUrl ?? null, input));

    doc.deliveries = deliveries as never;
    await doc.save();
    return { created: true, id: String(doc._id), deliveries };
  }

  private async deliverEmail(to: string, enabled: boolean, n: NotifyInput): Promise<Delivery> {
    const base = { channel: 'email' as const, attempts: 0, providerMessageId: null, at: this.deps.now() };
    if (!enabled) return { ...base, status: 'skipped', error: 'email notifications disabled in preferences' };
    const link = n.link ? `${this.deps.config.APP_BASE_URL}${n.link}` : null;
    const text = `${n.body ?? ''}${link ? `\n\nOpen: ${link}` : ''}\n\nManage notifications: ${this.deps.config.APP_BASE_URL}/app/settings`;
    if (!this.deps.email) {
      if (!this.deps.config.isProd) this.deps.devOutbox.push({ to, subject: n.title, text });
      return { ...base, status: 'skipped', error: 'email provider not configured' + (this.deps.config.isProd ? '' : ' (copied to dev outbox)') };
    }
    try {
      const { id } = await this.deps.email.send({ to, subject: n.title, text });
      return { ...base, attempts: 1, status: 'delivered', providerMessageId: id, error: null };
    } catch (e) {
      return { ...base, attempts: 1, status: 'failed', error: (e as Error).message.slice(0, 300) };
    }
  }

  private async deliverWebhook(enabled: boolean, url: string | null, n: NotifyInput): Promise<Delivery> {
    const base = { channel: 'webhook' as const, attempts: 0, providerMessageId: null, at: this.deps.now() };
    if (!enabled || !url) return { ...base, status: 'skipped', error: 'webhook not configured in preferences' };
    const text = `*${n.title}*\n${n.body ?? ''}`;
    // Slack incoming webhooks read `text`; Discord reads `content`.
    const payload = /discord(app)?\.com\/api\/webhooks/.test(url) ? { content: text.slice(0, 1900) } : { text };
    try {
      const r = await this.deps.safeFetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        timeoutMs: 8000,
        maxBytes: 64 * 1024,
        maxRedirects: 0,
      });
      const ok = r.status >= 200 && r.status < 300;
      return { ...base, attempts: 1, status: ok ? 'delivered' : 'failed', error: ok ? null : `webhook returned ${r.status}` };
    } catch (e) {
      return { ...base, attempts: 1, status: 'failed', error: (e as Error).message.slice(0, 300) };
    }
  }

  /** Notify every admin (deduped per admin). */
  async notifyAdmins(input: Omit<NotifyInput, 'userId'>) {
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) await this.notify({ ...input, userId: a._id, channels: ['in_app', 'email'] });
    return admins.length;
  }
}
