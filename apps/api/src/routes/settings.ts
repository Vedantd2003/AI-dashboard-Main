import { Router } from 'express';
import { z } from 'zod';
import { updateSettingsSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest } from '../lib/errors.js';
import { assertPublicUrl } from '../lib/safeFetch.js';
import { body, query } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import {
  Alert,
  AlertEvent,
  Notification,
  Portfolio,
  ResearchReport,
  ResearchRun,
  Session,
  SourceDocument,
  User,
  Watchlist,
} from '../models/index.js';
import { audit } from '../services/audit.js';
import { verifyPassword } from '../services/auth.js';
import { publicUser } from './auth.js';

export function settingsRouter(_ctx: AppContext) {
  const r = Router();

  r.get('/me/settings', requireAuth, (req, res) => {
    res.json({ user: publicUser(me(req)) });
  });

  r.patch('/me/settings', requireAuth, async (req, res) => {
    const input = body(req, updateSettingsSchema);
    const u = me(req);
    if (input.notificationPrefs?.webhookUrl) {
      const url = input.notificationPrefs.webhookUrl;
      if (!/^https:\/\//.test(url)) throw badRequest('Webhook URL must use https');
      await assertPublicUrl(url);
    }
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
      } catch {
        throw badRequest('Unknown time zone');
      }
    }
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.timezone !== undefined) update.timezone = input.timezone;
    if (input.dashboardWidgets !== undefined) update.dashboardWidgets = input.dashboardWidgets;
    for (const [k, v] of Object.entries(input.notificationPrefs ?? {})) update[`notificationPrefs.${k}`] = v;
    // `role` and `email` are intentionally not updatable here.
    const updated = await User.findByIdAndUpdate(u._id, { $set: update }, { returnDocument: 'after', runValidators: true });
    res.json({ user: publicUser(updated!) });
  });

  /** Permanently deletes the account and all user-owned data. Requires the password. */
  r.delete('/me', requireAuth, async (req, res) => {
    const { password } = body(req, z.object({ password: z.string().min(1).max(200) }));
    const u = await User.findById(me(req)._id).select('+passwordHash');
    if (!u || !(await verifyPassword(u.passwordHash, password))) throw badRequest('Password is incorrect');
    const userId = u._id;
    await Promise.all([
      Watchlist.deleteMany({ userId }),
      Portfolio.deleteMany({ userId }),
      Alert.deleteMany({ userId }),
      AlertEvent.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      ResearchReport.deleteMany({ userId }),
      ResearchRun.deleteMany({ userId }),
      SourceDocument.deleteMany({ ownerId: userId }),
      Session.deleteMany({ userId }),
    ]);
    await u.deleteOne();
    await audit('account.deleted', { userId, req });
    res.clearCookie('ap_session', { path: '/' });
    res.json({ ok: true });
  });

  /** One-click unsubscribe from all email notifications (link included in emails). */
  r.get('/unsubscribe', async (req, res) => {
    const { token } = query(req, z.object({ token: z.string().min(10).max(100) }));
    const result = await User.updateOne(
      { unsubscribeToken: token },
      { $set: { 'notificationPrefs.email': false, 'notificationPrefs.dailyBrief': false, 'notificationPrefs.weeklyDigest': false } },
    );
    res.json({ ok: result.matchedCount === 1 });
  });

  return r;
}
