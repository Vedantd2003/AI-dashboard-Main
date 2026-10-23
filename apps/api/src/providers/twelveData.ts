import { httpJson, RateLimitedError, type FetchLike } from '../lib/http.js';
import { upstream } from '../lib/errors.js';
import type { History, MarketDataProvider, MarketState, Quote, SymbolMatch } from './types.js';

/**
 * Twelve Data REST (https://twelvedata.com/docs).
 * Free/Basic plan: 800 req/day, 8 credits/min, US equities; internal non-display use only (see docs/DATA_SOURCES.md).
 * Twelve Data returns HTTP 200 with { status: "error", code, message } for many errors — handled here.
 * Quotes on the free plan are treated as DELAYED; daily bars as EOD.
 */
const BASE = 'https://api.twelvedata.com';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

interface TdError {
  status: 'error';
  code: number;
  message: string;
}
const isErr = (x: unknown): x is TdError => !!x && typeof x === 'object' && (x as { status?: string }).status === 'error';

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'Twelve Data';
  readonly capabilities = { quote: true, history: true, search: true, marketState: true, exchanges: ['NASDAQ', 'NYSE', 'AMEX', 'BATS'] };

  constructor(
    apiKey: string,
    private readonly fetchImpl?: FetchLike,
  ) {
    this.apiKey = apiKey.trim();
  }
  private readonly apiKey: string;

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    let data: T | TdError;
    try {
      data = await httpJson<T | TdError>(u.toString(), {
        provider: this.name,
        fetchImpl: this.fetchImpl,
        init: { headers: { Authorization: `apikey ${this.apiKey}` } },
      });
    } catch (e) {
      // Some plans/edge nodes only honour the query parameter. Retry once that way; the URL is never logged.
      if (!/returned 401/.test((e as Error).message)) throw e;
      u.searchParams.set('apikey', this.apiKey);
      data = await httpJson<T | TdError>(u.toString(), { provider: this.name, fetchImpl: this.fetchImpl, retries: 0 }).catch((e2: Error) => {
        if (/returned 401/.test(e2.message)) throw upstream(this.name, 'Twelve Data rejected the API key (401). Price history and charts are unavailable until TWELVE_DATA_API_KEY is replaced with a valid key.');
        throw e2;
      });
    }
    if (isErr(data)) {
      if (data.code === 429) throw new RateLimitedError(this.name, 60);
      throw upstream(this.name, data.message || `error ${data.code}`, data.code === 404 || data.code === 400 ? 404 : 502);
    }
    return data as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const q = await this.get<Record<string, unknown>>('/quote', { symbol });
    const ts = num(q.timestamp);
    const closeLike = num(q.close);
    return {
      symbol: String(q.symbol ?? symbol),
      name: (q.name as string) ?? null,
      exchange: (q.exchange as string) ?? null,
      currency: (q.currency as string) ?? null,
      price: closeLike,
      open: num(q.open),
      high: num(q.high),
      low: num(q.low),
      previousClose: num(q.previous_close),
      change: num(q.change),
      changePct: num(q.percent_change) === null ? null : (num(q.percent_change) as number) / 100,
      volume: num(q.volume),
      isMarketOpen: typeof q.is_market_open === 'boolean' ? q.is_market_open : null,
      freshness: 'delayed',
      provider: this.name,
      asOf: ts ? new Date(ts * 1000).toISOString() : (q.datetime as string) ?? null,
      retrievedAt: new Date().toISOString(),
    };
  }

  async getHistory(symbol: string, outputSize: number): Promise<History> {
    const r = await this.get<{ meta: Record<string, string>; values: Record<string, string>[] }>('/time_series', {
      symbol,
      interval: '1day',
      outputsize: Math.min(5000, Math.max(2, outputSize)),
      order: 'ASC',
    });
    const bars = (r.values ?? [])
      .map((v) => ({
        date: v.datetime!.slice(0, 10),
        open: num(v.open),
        high: num(v.high),
        low: num(v.low),
        close: num(v.close) as number,
        volume: num(v.volume),
      }))
      .filter((b) => Number.isFinite(b.close));
    return {
      symbol: r.meta?.symbol ?? symbol,
      interval: '1day',
      currency: r.meta?.currency ?? null,
      exchangeTimezone: r.meta?.exchange_timezone ?? null,
      bars,
      freshness: 'eod',
      provider: this.name,
      asOf: bars.length ? bars[bars.length - 1]!.date : null,
      retrievedAt: new Date().toISOString(),
    };
  }

  async search(q: string): Promise<SymbolMatch[]> {
    const r = await this.get<{ data: Record<string, string>[] }>('/symbol_search', { symbol: q, outputsize: 15 });
    return (r.data ?? []).map((d) => ({
      symbol: d.symbol!,
      name: d.instrument_name ?? d.symbol!,
      exchange: d.exchange ?? null,
      country: d.country ?? null,
      type: d.instrument_type ?? null,
      currency: d.currency ?? null,
    }));
  }

  async getMarketState(exchange: string): Promise<MarketState> {
    const r = await this.get<Record<string, unknown>[]>('/market_state', { exchange });
    const row = Array.isArray(r) ? r[0] : undefined;
    return {
      exchange,
      isOpen: row && typeof row.is_market_open === 'boolean' ? row.is_market_open : null,
      timeToOpen: (row?.time_to_open as string) ?? null,
      timeToClose: (row?.time_to_close as string) ?? null,
      provider: this.name,
      asOf: null,
      retrievedAt: new Date().toISOString(),
    };
  }
}
