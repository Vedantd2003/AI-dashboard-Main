import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  objectIdSchema,
  symbolSchema,
  watchlistCreateSchema,
  watchlistItemSchema,
  watchlistItemUpdateSchema,
  watchlistUpdateSchema,
} from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { body, params } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { Alert, Watchlist } from '../models/index.js';

const idParam = z.object({ id: objectIdSchema });
const itemParam = z.object({ id: objectIdSchema, symbol: symbolSchema });
const MAX_WATCHLISTS = 25;

export function watchlistsRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  /** Every lookup is scoped by the authenticated user's id; foreign ids return 404. */
  const owned = async (userId: Types.ObjectId, id: string) => {
    const wl = await Watchlist.findOne({ _id: id, userId });
    if (!wl) throw notFound('Watchlist');
    return wl;
  };

  r.get('/', async (req, res) => {
    const lists = await Watchlist.find({ userId: me(req)._id }).sort({ createdAt: 1 }).lean();
    res.json({ items: lists.map((l) => ({ ...l, id: String(l._id) })) });
  });

  r.post('/', async (req, res) => {
    const input = body(req, watchlistCreateSchema);
    const count = await Watchlist.countDocuments({ userId: me(req)._id });
    if (count >= MAX_WATCHLISTS) throw badRequest(`You can have at most ${MAX_WATCHLISTS} watchlists`);
    if (await Watchlist.exists({ userId: me(req)._id, name: input.name })) throw conflict('A watchlist with this name already exists');
    const wl = await Watchlist.create({ ...input, userId: me(req)._id });
    res.status(201).json({ ...wl.toObject(), id: String(wl._id) });
  });

  /** Watchlist with live quotes (quotes optional: shown as unavailable when the provider isn't configured). */
  r.get('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const wl = await owned(me(req)._id, id);
    const quotes = ctx.deps.market ? await ctx.markets.quotes(wl.items.map((i) => i.symbol)) : [];
    const qmap = new Map(quotes.map((q) => [q.symbol, q]));
    res.json({
      ...wl.toObject(),
      id: String(wl._id),
      marketDataConfigured: !!ctx.deps.market,
      items: wl.items.map((i) => ({ ...i.toObject(), quote: qmap.get(i.symbol)?.quote ?? null, quoteError: qmap.get(i.symbol)?.error ?? null })),
    });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, watchlistUpdateSchema);
    const wl = await owned(me(req)._id, id);
    if (input.name && input.name !== wl.name && (await Watchlist.exists({ userId: me(req)._id, name: input.name }))) {
      throw conflict('A watchlist with this name already exists');
    }
    wl.set(input);
    await wl.save();
    res.json({ ...wl.toObject(), id: String(wl._id) });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const wl = await owned(me(req)._id, id);
    await Alert.deleteMany({ userId: me(req)._id, watchlistId: wl._id });
    await wl.deleteOne();
    res.json({ ok: true });
  });

  r.post('/:id/items', async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, watchlistItemSchema);
    const wl = await owned(me(req)._id, id);
    if (wl.items.some((i) => i.symbol === input.symbol)) throw conflict(`${input.symbol} is already in this watchlist`);
    if (wl.items.length >= 100) throw badRequest('A watchlist holds at most 100 symbols');
    wl.items.push({ symbol: input.symbol, note: input.note ?? '' });
    await wl.save();
    res.status(201).json({ ...wl.toObject(), id: String(wl._id) });
  });

  r.patch('/:id/items/:symbol', async (req, res) => {
    const { id, symbol } = params(req, itemParam);
    const { note } = body(req, watchlistItemUpdateSchema);
    const wl = await owned(me(req)._id, id);
    const item = wl.items.find((i) => i.symbol === symbol);
    if (!item) throw notFound('Symbol');
    item.note = note;
    await wl.save();
    res.json({ ...wl.toObject(), id: String(wl._id) });
  });

  r.delete('/:id/items/:symbol', async (req, res) => {
    const { id, symbol } = params(req, itemParam);
    const wl = await owned(me(req)._id, id);
    const before = wl.items.length;
    wl.items.pull({ symbol } as never);
    wl.items = wl.items.filter((i) => i.symbol !== symbol) as never;
    if (wl.items.length === before) throw notFound('Symbol');
    await wl.save();
    res.json({ ...wl.toObject(), id: String(wl._id) });
  });

  return r;
}
