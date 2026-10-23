import { Router } from 'express';
import { z } from 'zod';
import { alertCreateSchema, alertUpdateSchema, objectIdSchema, paginationSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { body, params, query } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { Alert, AlertEvent, Notification, Watchlist } from '../models/index.js';
import { evaluateAllAlerts } from '../services/alerts.js';

const idParam = z.object({ id: objectIdSchema });

export function alertsRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const items = await Alert.find({ userId: me(req)._id }).sort({ createdAt: -1 }).lean();
    res.json({ items: items.map((a) => ({ ...a, id: String(a._id) })) });
  });

  r.post('/', async (req, res) => {
    const input = body(req, alertCreateSchema);
    if ((await Alert.countDocuments({ userId: me(req)._id })) >= 100) throw badRequest('At most 100 alerts');
    if (input.watchlistId && !(await Watchlist.exists({ _id: input.watchlistId, userId: me(req)._id }))) throw notFound('Watchlist');
    const a = await Alert.create({ ...input, userId: me(req)._id });
    res.status(201).json({ ...a.toObject(), id: String(a._id) });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, alertUpdateSchema);
    const a = await Alert.findOneAndUpdate({ _id: id, userId: me(req)._id }, { $set: input }, { returnDocument: 'after', runValidators: true });
    if (!a) throw notFound('Alert');
    res.json({ ...a.toObject(), id: String(a._id) });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const d = await Alert.deleteOne({ _id: id, userId: me(req)._id });
    if (!d.deletedCount) throw notFound('Alert');
    res.json({ ok: true });
  });

  r.get('/events', async (req, res) => {
    const { page, pageSize } = query(req, paginationSchema);
    const filter = { userId: me(req)._id };
    const [items, total] = await Promise.all([
      AlertEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AlertEvent.countDocuments(filter),
    ]);
    res.json({ items, page, pageSize, total });
  });

  /** Evaluate only this user's alerts now. */
  r.post('/evaluate', ctx.limits.expensive, async (req, res) => {
    if (!ctx.deps.market) {
      return res.status(503).json({ error: { code: 'integration_not_configured', message: 'Market data is not configured', details: { hint: 'Set TWELVE_DATA_API_KEY.' } } });
    }
    res.json(await evaluateAllAlerts(ctx.deps, ctx.markets, ctx.notifications, String(me(req)._id)));
  });

  return r;
}

export function notificationsRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const { page, pageSize, unread } = query(req, paginationSchema.extend({ unread: z.enum(['true', 'false']).optional() }));
    const filter: Record<string, unknown> = { userId: me(req)._id };
    if (unread === 'true') filter.readAt = null;
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: me(req)._id, readAt: null }),
    ]);
    res.json({
      items: items.map((n) => ({ ...n, id: String(n._id) })),
      page,
      pageSize,
      total,
      unreadCount,
      channels: { email: !!ctx.deps.email, webhook: true },
    });
  });

  r.post('/:id/read', async (req, res) => {
    const { id } = params(req, idParam);
    const n = await Notification.findOneAndUpdate({ _id: id, userId: me(req)._id }, { $set: { readAt: new Date() } }, { returnDocument: 'after' });
    if (!n) throw notFound('Notification');
    res.json({ ok: true });
  });

  r.post('/read-all', async (req, res) => {
    const u = await Notification.updateMany({ userId: me(req)._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true, updated: u.modifiedCount });
  });

  /** Sends a test notification through every channel enabled in the user's preferences and reports real statuses. */
  r.post('/test', ctx.limits.expensive, async (req, res) => {
    const result = await ctx.notifications.notify({
      userId: me(req)._id,
      kind: 'system',
      title: 'Test notification from AlphaPulse',
      body: 'If you can read this, this channel works.',
      link: '/app/alerts',
      dedupeKey: `test:${Date.now()}`,
      channels: ['in_app', 'email', 'webhook'],
    });
    res.json(result);
  });

  if (!ctx.deps.config.isProd) {
    r.get('/dev/outbox', (_req, res) => res.json({ note: 'Development only. Messages here were NOT delivered.', items: ctx.deps.devOutbox.messages }));
  }

  return r;
}
