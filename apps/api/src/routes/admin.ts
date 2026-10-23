import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { body, params, query } from '../lib/validate.js';
import { me, requireAdmin } from '../middleware/auth.js';
import { AuditEvent, Session, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { publicUser } from './auth.js';

export function adminRouter(_ctx: AppContext) {
  const r = Router();
  r.use(requireAdmin);

  r.get('/users', async (req, res) => {
    const { page, pageSize } = query(req, paginationSchema);
    const [items, total] = await Promise.all([User.find().sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize), User.countDocuments()]);
    res.json({ items: items.map(publicUser), page, pageSize, total });
  });

  r.patch('/users/:id/role', async (req, res) => {
    const { id } = params(req, z.object({ id: objectIdSchema }));
    const { role } = body(req, z.object({ role: z.enum(['user', 'admin']) }));
    if (String(me(req)._id) === id && role !== 'admin') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins <= 1) throw badRequest('Cannot remove the last administrator');
    }
    const u = await User.findByIdAndUpdate(id, { role }, { returnDocument: 'after' });
    if (!u) throw notFound('User');
    await Session.deleteMany({ userId: u._id }); // force re-login so the new role applies cleanly
    await audit('admin.role_changed', { userId: me(req)._id, req, target: id, meta: { role } });
    res.json({ user: publicUser(u) });
  });

  r.get('/audit', async (req, res) => {
    const { page, pageSize } = query(req, paginationSchema);
    const [items, total] = await Promise.all([AuditEvent.find().sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(), AuditEvent.countDocuments()]);
    res.json({ items, page, pageSize, total });
  });

  return r;
}
