import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { buildContext } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import type { AppContext } from '../src/context.js';
import type { Deps } from '../src/deps.js';
import { DevOutbox, type EmailProvider } from '../src/providers/email.js';
import type { LlmProvider, LlmRequest } from '../src/providers/llm.js';
import type { FundamentalsProvider, History, MarketDataProvider, NewsItem, Quote } from '../src/providers/types.js';
import { createLogger } from '../src/logger.js';
import { syncAllIndexes } from '../src/models/index.js';
import { ensureWorkflowDefinitions } from '../src/services/workflows.js';

/**
 * TEST FIXTURES — deterministic fakes for external providers. Never used in production code paths.
 * Prices are synthetic and exist only to exercise calculations.
 */
export const FIXTURE_NOW = new Date('2026-10-21T15:00:00Z'); // a Wednesday, NYSE open day

export function fixtureBars(symbol: string, n = 300, start = 100, drift = 0.001): History['bars'] {
  const bars: History['bars'] = [];
  const d = new Date(FIXTURE_NOW);
  let price = start;
  const dates: string[] = [];
  while (dates.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
  }
  let seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  for (const date of dates) {
    seed = (seed * 9301 + 49297) % 233280;
    price *= 1 + drift + (seed / 233280 - 0.5) * 0.02;
    bars.push({ date, open: price, high: price * 1.01, low: price * 0.99, close: Number(price.toFixed(4)), volume: 1000 });
  }
  return bars;
}

export class FakeMarket implements MarketDataProvider {
  readonly name: string = 'Twelve Data';
  readonly capabilities = { quote: true, history: true, search: true, marketState: true, exchanges: ['NYSE'] };
  calls = 0;
  failing = new Set<string>();
  prices: Record<string, { price: number; previousClose: number }> = {};
  async getQuote(symbol: string): Promise<Quote> {
    this.calls++;
    if (this.failing.has(symbol)) throw Object.assign(new Error(`${symbol} not found`), { code: 'upstream_error' });
    const p = this.prices[symbol] ?? { price: 100, previousClose: 98 };
    return {
      symbol, name: `${symbol} Inc`, exchange: 'NYSE', currency: 'USD', price: p.price, open: null, high: null, low: null,
      previousClose: p.previousClose, change: p.price - p.previousClose, changePct: p.price / p.previousClose - 1, volume: 1,
      isMarketOpen: true, freshness: 'delayed', provider: this.name, asOf: FIXTURE_NOW.toISOString(), retrievedAt: FIXTURE_NOW.toISOString(),
    };
  }
  async getHistory(symbol: string, size: number): Promise<History> {
    this.calls++;
    if (this.failing.has(symbol)) throw new Error('history down');
    const bars = fixtureBars(symbol).slice(-size);
    return { symbol, interval: '1day', currency: 'USD', exchangeTimezone: 'America/New_York', bars, freshness: 'eod', provider: this.name, asOf: bars.at(-1)!.date, retrievedAt: FIXTURE_NOW.toISOString() };
  }
  async search(q: string) {
    return [{ symbol: q.toUpperCase(), name: `${q} Corp`, exchange: 'NYSE', country: 'United States', type: 'Common Stock', currency: 'USD' }];
  }
  async getMarketState(exchange: string) {
    return { exchange, isOpen: true, timeToOpen: null, timeToClose: '01:00:00', provider: this.name, asOf: null, retrievedAt: FIXTURE_NOW.toISOString() };
  }
}

export class FakeFundamentals implements FundamentalsProvider {
  readonly name: string = 'Finnhub';
  news: NewsItem[] = [];
  async getProfile(symbol: string) {
    return { symbol, name: `${symbol} Inc`, exchange: 'NYSE', country: 'US', currency: 'USD', industry: 'Technology', ipo: null, website: null, marketCap: 1e12, sharesOutstanding: 1e9, provider: this.name, asOf: null, retrievedAt: FIXTURE_NOW.toISOString() };
  }
  async getMetrics(symbol: string) {
    return { symbol, currency: 'USD', metrics: [{ key: 'peTTM', label: 'P/E', value: 25, unit: 'ratio' as const, period: 'TTM' }], provider: this.name, asOf: null, retrievedAt: FIXTURE_NOW.toISOString() };
  }
  async getCompanyNews(symbol: string) {
    return this.news.filter((n) => n.symbol === symbol);
  }
  async getMarketNews() {
    return this.news;
  }
}

export class FakeLlm implements LlmProvider {
  readonly name = 'OpenRouter';
  readonly model = 'test/fake-model';
  requests: LlmRequest[] = [];
  responses: string[] = [];
  async complete(req: LlmRequest) {
    this.requests.push(req);
    const content = this.responses.shift() ?? '{}';
    return { content, model: this.model, usage: { promptTokens: 100, completionTokens: 50 } };
  }
}

export class FakeEmail implements EmailProvider {
  readonly name = 'Resend';
  sent: { to: string; subject: string; text: string }[] = [];
  fail = false;
  async send(m: { to: string; subject: string; text: string }) {
    if (this.fail) throw new Error('provider rejected');
    this.sent.push(m);
    return { id: `msg_${this.sent.length}` };
  }
}

let mongo: MongoMemoryServer | null = null;

export async function startDb() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'alphapulse_test' });
  await syncAllIndexes();
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongo?.stop();
}

export async function resetDb() {
  const cols = await mongoose.connection.db!.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
  await ensureWorkflowDefinitions();
}

export interface TestApp {
  app: Express;
  ctx: AppContext;
  market: FakeMarket;
  fundamentals: FakeFundamentals;
  llm: FakeLlm;
  email: FakeEmail;
}

export async function buildTestApp(overrides: Partial<Record<'market' | 'fundamentals' | 'llm' | 'email', boolean>> = {}, env: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({ NODE_ENV: 'test', APP_BASE_URL: 'http://localhost:3000', SESSION_SECRET: 'x'.repeat(40), N8N_WEBHOOK_SECRET: 'n8n-test-secret', ...env });
  const market = new FakeMarket();
  const fundamentals = new FakeFundamentals();
  const llm = new FakeLlm();
  const email = new FakeEmail();
  const deps: Deps = {
    config,
    logger: createLogger('silent'),
    market: overrides.market === false ? null : market,
    fundamentals: overrides.fundamentals === false ? null : fundamentals,
    sec: null,
    llm: overrides.llm === false ? null : llm,
    email: overrides.email === false ? null : email,
    devOutbox: new DevOutbox(),
    safeFetch: (async () => ({ status: 200, finalUrl: '', contentType: 'application/json', text: '', bytes: Buffer.alloc(0) })) as never,
    now: () => FIXTURE_NOW,
  };
  const ctx = await buildContext(deps, { rateLimitScale: 1000 });
  return { app: createApp(ctx), ctx, market, fundamentals, llm, email };
}

/** supertest agent with cookie jar + CSRF header on mutations. */
export function client(app: Express) {
  const agent = request.agent(app);
  const csrf = { 'X-AlphaPulse-CSRF': '1' };
  return {
    agent,
    get: (p: string) => agent.get(`/api/v1${p}`),
    post: (p: string, body?: object) => agent.post(`/api/v1${p}`).set(csrf).send(body ?? {}),
    patch: (p: string, body?: object) => agent.patch(`/api/v1${p}`).set(csrf).send(body ?? {}),
    del: (p: string, body?: object) => agent.delete(`/api/v1${p}`).set(csrf).send(body ?? {}),
  };
}

export async function registered(app: Express, email = `u${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const c = client(app);
  const r = await c.post('/auth/register', { email, password: 'correct-horse-9', name: 'Test User' });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { c, user: r.body.user as { id: string; role: string; email: string } };
}
