import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  compareToBenchmark,
  correlationMatrix,
  drawdownSeries,
  historicalPortfolioValue,
  maxDrawdown,
  objectIdSchema,
  portfolioCreateSchema,
  portfolioUpdateSchema,
  valuePortfolio,
} from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { body, params, query } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { Portfolio } from '../models/index.js';

const idParam = z.object({ id: objectIdSchema });

export function portfoliosRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  const owned = async (userId: Types.ObjectId, id: string) => {
    const p = await Portfolio.findOne({ _id: id, userId });
    if (!p) throw notFound('Portfolio');
    return p;
  };

  r.get('/', async (req, res) => {
    const items = await Portfolio.find({ userId: me(req)._id }).sort({ updatedAt: -1 }).lean();
    res.json({ items: items.map((p) => ({ ...p, id: String(p._id) })) });
  });

  r.post('/', async (req, res) => {
    const input = body(req, portfolioCreateSchema);
    if ((await Portfolio.countDocuments({ userId: me(req)._id })) >= 10) throw badRequest('At most 10 hypothetical portfolios');
    const p = await Portfolio.create({ ...input, benchmark: input.benchmark ?? 'SPY', userId: me(req)._id, kind: 'hypothetical' });
    res.status(201).json({ ...p.toObject(), id: String(p._id) });
  });

  r.get('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const p = await owned(me(req)._id, id);
    res.json({ ...p.toObject(), id: String(p._id) });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, portfolioUpdateSchema);
    const p = await owned(me(req)._id, id);
    p.set(input);
    await p.save();
    res.json({ ...p.toObject(), id: String(p._id) });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const p = await owned(me(req)._id, id);
    await p.deleteOne();
    res.json({ ok: true });
  });

  /**
   * Valuation + analytics. Unpriced positions are reported, never valued at a guessed price.
   * Historical analytics assume constant quantities over the window (purchase dates ignored) — stated in `assumptions`.
   */
  r.get('/:id/analytics', ctx.limits.market, async (req, res) => {
    const { id } = params(req, idParam);
    const { range } = query(req, z.object({ range: z.enum(['3M', '6M', '1Y']).default('1Y') }));
    const p = await owned(me(req)._id, id);
    const positions = p.positions.map((x) => ({ symbol: x.symbol, quantity: x.quantity, averageCost: x.averageCost, currency: x.currency }));
    if (!ctx.deps.market) {
      return res.json({
        marketDataConfigured: false,
        valuation: valuePortfolio(positions, {}),
        message: 'Market data provider not configured — positions cannot be valued.',
      });
    }
    const symbols = [...new Set(positions.map((x) => x.symbol))];
    const quotes = await ctx.markets.quotes(symbols);
    const prices: Record<string, number | null> = {};
    const priceMeta: Record<string, unknown> = {};
    for (const q of quotes) {
      prices[q.symbol] = q.quote?.price ?? null;
      priceMeta[q.symbol] = q.quote ? { asOf: q.quote.asOf, freshness: q.quote.freshness, provider: q.quote.provider, currency: q.quote.currency } : { error: q.error };
    }
    // Currency mismatch guard: if the provider's quote currency differs from the position currency, do not value it.
    const currencyMismatches: string[] = [];
    for (const pos of positions) {
      const qc = quotes.find((q) => q.symbol === pos.symbol)?.quote?.currency;
      if (qc && qc.toUpperCase() !== pos.currency.toUpperCase()) {
        prices[pos.symbol] = null;
        currencyMismatches.push(`${pos.symbol}: position in ${pos.currency}, quote in ${qc}`);
      }
    }
    const valuation = valuePortfolio(positions, prices);

    const histories: Record<string, { date: string; close: number }[]> = {};
    const historyErrors: Record<string, string> = {};
    await Promise.all(
      [...symbols, p.benchmark].map(async (s) => {
        try {
          const h = await ctx.markets.history(s, range);
          histories[s] = h.bars.map((b) => ({ date: b.date, close: b.close }));
        } catch (e) {
          historyErrors[s] = (e as Error).message;
        }
      }),
    );

    // Historical analytics per currency would require FX; we compute only when all positions share one currency.
    const currencies = [...new Set(positions.map((x) => x.currency))];
    let history = null;
    if (currencies.length === 1 && positions.length && positions.every((x) => histories[x.symbol]?.length)) {
      const series = historicalPortfolioValue(positions, histories);
      const bench = histories[p.benchmark] ?? [];
      history = {
        series,
        drawdown: drawdownSeries(series),
        maxDrawdown: maxDrawdown(series),
        benchmark: { symbol: p.benchmark, ...compareToBenchmark(series, bench) },
        correlation: symbols.length >= 2 ? correlationMatrix(symbols.map((s) => ({ symbol: s, series: histories[s]! }))) : null,
      };
    }

    res.json({
      marketDataConfigured: true,
      kind: 'hypothetical',
      valuation,
      priceMeta,
      currencyMismatches,
      history,
      historyErrors,
      range,
      assumptions: [
        'Hypothetical holdings entered by you — not verified brokerage positions.',
        'Historical value assumes today’s quantities were held throughout the window; purchase dates are not applied.',
        'No dividends, fees, FX conversion or taxes are included.',
        currencies.length > 1 ? 'Positions span multiple currencies; totals are shown per currency and historical analytics are disabled.' : null,
      ].filter(Boolean),
    });
  });

  return r;
}
