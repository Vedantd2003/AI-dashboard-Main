import type { Deps } from '../deps.js';
import { TtlCache } from '../lib/cache.js';
import { AppError, notConfigured } from '../lib/errors.js';
import type { CompanyProfile, FinancialMetrics, History, MarketState, NewsItem, Quote, SymbolMatch } from '../providers/types.js';
import { summarizeSeries } from '@alphapulse/shared';

export type HistoryRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

/**
 * Broad-market proxies. These are ETFs that TRACK the indices; the UI labels them as such
 * (index levels themselves need a licensed index feed).
 */
export const MARKET_PROXIES = [
  { symbol: 'SPY', label: 'S&P 500 (SPY ETF)' },
  { symbol: 'QQQ', label: 'Nasdaq-100 (QQQ ETF)' },
  { symbol: 'DIA', label: 'Dow Jones Industrial Avg (DIA ETF)' },
  { symbol: 'IWM', label: 'Russell 2000 (IWM ETF)' },
] as const;

const TTL = { quote: 60_000, history: 15 * 60_000, profile: 24 * 3600_000, metrics: 6 * 3600_000, search: 3600_000, news: 10 * 60_000, state: 5 * 60_000 };

export interface ProviderStatus {
  provider: string;
  configured: boolean;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
}

function rangeStart(range: HistoryRange, now: Date): Date {
  const d = new Date(now);
  switch (range) {
    case '1M': d.setUTCMonth(d.getUTCMonth() - 1); break;
    case '3M': d.setUTCMonth(d.getUTCMonth() - 3); break;
    case '6M': d.setUTCMonth(d.getUTCMonth() - 6); break;
    case 'YTD': return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case '1Y': d.setUTCFullYear(d.getUTCFullYear() - 1); break;
    case '5Y': d.setUTCFullYear(d.getUTCFullYear() - 5); break;
  }
  return d;
}

/** Trading-day counts are approximate; we over-fetch then trim by date. */
const OUTPUT_SIZE: Record<HistoryRange, number> = { '1M': 30, '3M': 70, '6M': 135, YTD: 260, '1Y': 260, '5Y': 1270 };

export class MarketService {
  private cache = new TtlCache<unknown>(2000);
  readonly status = new Map<string, ProviderStatus>();

  constructor(private readonly deps: Deps) {
    for (const [name, configured] of [
      ['Twelve Data', !!deps.market],
      ['Finnhub', !!deps.fundamentals],
      ['SEC EDGAR', !!deps.sec],
      ['OpenRouter', !!deps.llm],
    ] as const) {
      this.status.set(name, { provider: name, configured, lastOkAt: null, lastErrorAt: null, lastError: null, lastLatencyMs: null });
    }
  }

  private async track<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    const st = this.status.get(provider);
    try {
      const v = await fn();
      if (st) Object.assign(st, { lastOkAt: new Date().toISOString(), lastLatencyMs: Date.now() - t0 });
      return v;
    } catch (e) {
      if (st) Object.assign(st, { lastErrorAt: new Date().toISOString(), lastError: (e as Error).message, lastLatencyMs: Date.now() - t0 });
      throw e;
    }
  }

  recordOk(provider: string, latencyMs: number) {
    const st = this.status.get(provider);
    if (st) Object.assign(st, { lastOkAt: new Date().toISOString(), lastLatencyMs: latencyMs });
  }
  recordError(provider: string, message: string) {
    const st = this.status.get(provider);
    if (st) Object.assign(st, { lastErrorAt: new Date().toISOString(), lastError: message });
  }

  private requireMarket() {
    if (!this.deps.market) throw notConfigured('Market data', 'Set TWELVE_DATA_API_KEY on the API service.');
    return this.deps.market;
  }
  private requireFundamentals() {
    if (!this.deps.fundamentals) throw notConfigured('Company fundamentals & news', 'Set FINNHUB_API_KEY on the API service.');
    return this.deps.fundamentals;
  }

  private cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    return this.cache.wrap(key, ttl, fn as () => Promise<unknown>) as Promise<T>;
  }

  quote(symbol: string): Promise<Quote> {
    const m = this.deps.market;
    const f = this.deps.fundamentals;
    const backup = f?.getQuote ? () => this.track(f.name, () => f.getQuote!(symbol)) : null;
    if (!m && !backup) this.requireMarket();
    return this.cached(`q:${symbol}`, TTL.quote, async () => {
      if (!m) return backup!();
      try {
        return await this.track(m.name, () => m.getQuote(symbol));
      } catch (e) {
        // Primary provider down, rate-limited or misconfigured: use the backup source rather than show nothing.
        if (!backup || (e instanceof AppError && e.status === 404)) throw e;
        return backup().catch(() => {
          throw e;
        });
      }
    });
  }

  /** Quotes for many symbols; individual failures are returned as errors rather than failing the batch. */
  async quotes(symbols: string[]): Promise<{ symbol: string; quote: Quote | null; error: string | null }[]> {
    return Promise.all(
      symbols.map(async (symbol) => {
        try {
          return { symbol, quote: await this.quote(symbol), error: null };
        } catch (e) {
          return { symbol, quote: null, error: e instanceof AppError ? e.message : 'Unavailable' };
        }
      }),
    );
  }

  async history(symbol: string, range: HistoryRange): Promise<History & { range: HistoryRange; summary: ReturnType<typeof summarizeSeries> }> {
    const m = this.deps.market;
    const f = this.deps.fundamentals;
    const backup = f?.getHistory ? (n: number) => this.track(f.name, () => f.getHistory!(symbol, n)) : null;
    if (!m && !backup) this.requireMarket();
    const size = OUTPUT_SIZE[range];
    const full = await this.cached<History>(`h:${symbol}:${size}`, TTL.history, async () => {
      if (!m) return backup!(size);
      try {
        return await this.track(m.name, () => m.getHistory(symbol, size));
      } catch (e) {
        if (!backup || (e instanceof AppError && e.status === 404)) throw e;
        // Keep the primary provider's (clearer) error if the backup isn't entitled either.
        return backup(size).catch(() => {
          throw e;
        });
      }
    });
    const start = rangeStart(range, this.deps.now()).toISOString().slice(0, 10);
    const bars = full.bars.filter((b) => b.date >= start);
    return { ...full, bars, range, summary: summarizeSeries(bars.map((b) => ({ date: b.date, close: b.close }))) };
  }

  search(q: string): Promise<SymbolMatch[]> {
    const m = this.requireMarket();
    return this.cached(`s:${q.toLowerCase()}`, TTL.search, () => this.track(m.name, () => m.search(q)));
  }

  marketState(exchange = 'NYSE'): Promise<MarketState> {
    const m = this.requireMarket();
    return this.cached(`ms:${exchange}`, TTL.state, () => this.track(m.name, () => m.getMarketState(exchange)));
  }

  profile(symbol: string): Promise<CompanyProfile> {
    const f = this.requireFundamentals();
    return this.cached(`p:${symbol}`, TTL.profile, () => this.track(f.name, () => f.getProfile(symbol)));
  }

  metrics(symbol: string): Promise<FinancialMetrics> {
    const f = this.requireFundamentals();
    return this.cached(`m:${symbol}`, TTL.metrics, () => this.track(f.name, () => f.getMetrics(symbol)));
  }

  companyNews(symbol: string, days = 14): Promise<NewsItem[]> {
    const f = this.requireFundamentals();
    const to = this.deps.now();
    const from = new Date(to.getTime() - days * 86_400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    return this.cached(`n:${symbol}:${days}:${d(to)}`, TTL.news, () => this.track(f.name, () => f.getCompanyNews(symbol, d(from), d(to))));
  }

  marketNews(): Promise<NewsItem[]> {
    const f = this.requireFundamentals();
    return this.cached('n:market', TTL.news, () => this.track(f.name, () => f.getMarketNews()));
  }

  async overview() {
    const configured = !!this.deps.market;
    if (!configured) {
      return { configured: false, proxies: [], marketState: null, note: 'Market data provider not configured (TWELVE_DATA_API_KEY).' };
    }
    const [quotes, state] = await Promise.all([
      this.quotes(MARKET_PROXIES.map((p) => p.symbol)),
      this.marketState('NYSE').catch(() => null),
    ]);
    return {
      configured: true,
      proxies: quotes.map((q, i) => ({ ...q, label: MARKET_PROXIES[i]!.label })),
      marketState: state,
      note: 'Index levels are shown via ETFs that track them. Quotes are delayed.',
    };
  }

  providerStatuses(): ProviderStatus[] {
    return [...this.status.values()];
  }

  clearCache() {
    this.cache.clear();
  }
}
