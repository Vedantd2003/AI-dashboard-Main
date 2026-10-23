import { Router } from 'express';
import { z } from 'zod';
import { correlationMatrix, historyQuerySchema, searchQuerySchema, symbolSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { badRequest } from '../lib/errors.js';
import { params, query } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { ingestNews } from '../services/ingestion.js';

const symbolParam = z.object({ symbol: symbolSchema });

/** Wraps an optional sub-request so one failing provider doesn't fail the whole page. */
async function settle<T>(p: () => Promise<T>) {
  try {
    return { data: await p(), error: null as null | { code: string; message: string } };
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { data: null, error: { code: err.code ?? 'error', message: err.message } };
  }
}

export function marketsRouter(ctx: AppContext) {
  const r = Router();
  const m = ctx.markets;
  r.use(requireAuth, ctx.limits.market);

  r.get('/overview', async (_req, res) => {
    res.json(await m.overview());
  });

  /** Batch quotes for dashboard charts (2–25 symbols). Individual failures come back as `error`, never as a guessed price. */
  r.get('/quotes', async (req, res) => {
    const { symbols } = query(req, z.object({ symbols: z.string().max(300) }));
    const list = [...new Set(symbols.split(',').filter(Boolean).map((s) => symbolSchema.parse(s.trim().toUpperCase())))];
    if (!list.length || list.length > 25) throw badRequest('Provide 1–25 symbols');
    res.json({ items: await m.quotes(list), retrievedAt: new Date().toISOString() });
  });

  r.get('/news', async (_req, res) => {
    const news = await m.marketNews();
    res.json({ items: news, provider: 'Finnhub', retrievedAt: new Date().toISOString() });
  });

  r.get('/search', async (req, res) => {
    const { q } = query(req, searchQuerySchema);
    res.json({ results: await m.search(q), provider: 'Twelve Data' });
  });

  r.get('/compare', async (req, res) => {
    const { symbols, range } = query(
      req,
      z.object({ symbols: z.string().max(120), range: historyQuerySchema.shape.range }),
    );
    const list = [...new Set(symbols.split(',').map((s) => symbolSchema.parse(s)))];
    if (list.length < 2 || list.length > 5) throw badRequest('Provide 2–5 symbols');
    const results = await Promise.all(list.map((s) => settle(() => m.history(s, range))));
    const metrics = await Promise.all(list.map((s) => settle(() => m.metrics(s))));
    const ok = results.map((x, i) => ({ symbol: list[i]!, h: x.data })).filter((x) => x.h);
    const corr =
      ok.length >= 2
        ? { ...correlationMatrix(ok.map((x) => ({ symbol: x.symbol, series: x.h!.bars.map((b) => ({ date: b.date, close: b.close })) }))), method: 'Pearson correlation of daily simple returns over common trading dates' }
        : null;
    res.json({
      range,
      symbols: list.map((s, i) => ({
        symbol: s,
        summary: results[i]!.data?.summary ?? null,
        currency: results[i]!.data?.currency ?? null,
        history: results[i]!.data ? results[i]!.data!.bars.map((b) => ({ date: b.date, close: b.close })) : [],
        historyError: results[i]!.error,
        metrics: metrics[i]!.data?.metrics ?? [],
        metricsError: metrics[i]!.error,
      })),
      correlation: corr,
      provider: { history: [...new Set(results.map((x) => x.data?.provider).filter(Boolean))].join(', ') || (ctx.deps.market?.name ?? 'Twelve Data'), metrics: 'Finnhub' },
    });
  });

  r.get('/:symbol', async (req, res) => {
    const { symbol } = params(req, symbolParam);
    const [quote, profile, metrics] = await Promise.all([settle(() => m.quote(symbol)), settle(() => m.profile(symbol)), settle(() => m.metrics(symbol))]);
    if (quote.error && profile.error && quote.error.code !== 'integration_not_configured') {
      // Neither provider knows this symbol.
      if (quote.error.code === 'upstream_error' && /not found|invalid|symbol/i.test(quote.error.message)) {
        return res.status(404).json({ error: { code: 'not_found', message: `${symbol} is not supported by the configured provider` } });
      }
    }
    res.json({ symbol, quote, profile, metrics });
  });

  r.get('/:symbol/history', async (req, res) => {
    const { symbol } = params(req, symbolParam);
    const { range } = query(req, historyQuerySchema);
    res.json(await m.history(symbol, range));
  });

  r.get('/:symbol/news', async (req, res) => {
    const { symbol } = params(req, symbolParam);
    const { days } = query(req, z.object({ days: z.coerce.number().int().min(1).max(30).default(14) }));
    const items = await m.companyNews(symbol, days);
    // Persist as sources so they can be cited later (idempotent).
    void ingestNews(items).catch(() => undefined);
    res.json({ items, provider: 'Finnhub', retrievedAt: new Date().toISOString() });
  });

  r.get('/:symbol/filings', async (req, res) => {
    const { symbol } = params(req, symbolParam);
    if (!ctx.deps.sec) {
      return res.status(503).json({ error: { code: 'integration_not_configured', message: 'SEC EDGAR is not configured', details: { hint: 'Set SEC_USER_AGENT (e.g. "AlphaPulse admin@example.com").' } } });
    }
    const filings = await ctx.deps.sec.recentFilings(symbol, 365, 15);
    res.json({ items: filings, provider: 'SEC EDGAR', note: filings.length ? undefined : 'No recent filings found, or the symbol is not an SEC registrant.' });
  });

  return r;
}
