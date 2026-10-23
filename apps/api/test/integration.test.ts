import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signPayload } from '../src/lib/crypto.js';
import { Alert, AlertEvent, AuditEvent, Notification, ResearchReport, Session, SourceDocument, User, WorkflowDefinition, WorkflowExecution } from '../src/models/index.js';
import { upsertSource } from '../src/services/ingestion.js';
import { buildTestApp, client, FIXTURE_NOW, registered, resetDb, startDb, stopDb, type TestApp } from './helpers.js';

let t: TestApp;

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});
beforeEach(async () => {
  await resetDb();
  t = await buildTestApp();
});

describe('health & docs', () => {
  it('reports db and integration presence without secrets', async () => {
    const r = await request(t.app).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body.database.state).toBe('connected');
    expect(r.body.integrations.queue).toBe('in_process');
    expect(JSON.stringify(r.body)).not.toMatch(/secret|n8n-test/);
  });
  it('serves OpenAPI', async () => {
    const r = await request(t.app).get('/api/v1/openapi.json');
    expect(r.body.openapi).toBe('3.0.3');
    expect(Object.keys(r.body.paths)).toContain('/research');
  });
  it('consistent 404 envelope', async () => {
    const r = await request(t.app).get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('not_found');
  });
});

describe('authentication', () => {
  it('register → me → logout → me 401; cookie is HttpOnly + SameSite=Lax', async () => {
    const c = client(t.app);
    const r = await c.post('/auth/register', { email: 'Ana@Example.com', password: 'correct-horse-9', name: 'Ana' });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('ana@example.com');
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/ap_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(r.body.user).not.toHaveProperty('passwordHash');
    expect((await c.get('/auth/me')).status).toBe(200);
    expect((await c.post('/auth/logout')).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('stores Argon2id hashes and only the SHA-256 of session tokens', async () => {
    const { c } = await registered(t.app, 'hash@example.com');
    const u = await User.findOne({ email: 'hash@example.com' }).select('+passwordHash');
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    const s = await Session.findOne({ userId: u!._id });
    const token = String((await c.get('/auth/me')).request.cookies ?? '');
    expect(s!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toContain(s!.tokenHash);
  });

  it('first user is admin, later users are not', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    expect(a.user.role).toBe('admin');
    expect(b.user.role).toBe('user');
  });

  it('rejects weak passwords, duplicate emails, bad logins with a uniform message', async () => {
    const c = client(t.app);
    expect((await c.post('/auth/register', { email: 'a@b.co', password: 'short', name: 'x' })).status).toBe(400);
    await c.post('/auth/register', { email: 'dup@b.co', password: 'correct-horse-9', name: 'x' });
    expect((await client(t.app).post('/auth/register', { email: 'dup@b.co', password: 'correct-horse-9', name: 'x' })).status).toBe(409);
    const wrong = await client(t.app).post('/auth/login', { email: 'dup@b.co', password: 'wrong-password-1' });
    const unknown = await client(t.app).post('/auth/login', { email: 'nobody@b.co', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(await AuditEvent.countDocuments({ action: 'auth.login_failed' })).toBe(2);
  });

  it('rejects NoSQL operator injection in login', async () => {
    const r = await client(t.app).post('/auth/login', { email: { $ne: null }, password: { $ne: null } });
    expect(r.status).toBe(400);
  });

  it('CSRF: mutations without header or from a foreign origin are refused', async () => {
    const { c } = await registered(t.app);
    const noHeader = await c.agent.post('/api/v1/watchlists').send({ name: 'x' });
    expect(noHeader.status).toBe(403);
    const foreign = await c.agent.post('/api/v1/watchlists').set('X-AlphaPulse-CSRF', '1').set('Origin', 'https://evil.example').send({ name: 'x' });
    expect(foreign.status).toBe(403);
    const ok = await c.agent.post('/api/v1/watchlists').set('X-AlphaPulse-CSRF', '1').set('Origin', 'http://localhost:3000').send({ name: 'x' });
    expect(ok.status).toBe(201);
  });

  it('expired sessions are rejected and removed', async () => {
    const { c } = await registered(t.app);
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await c.get('/auth/me')).status).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('password reset: email sent, token single-use, all sessions revoked', async () => {
    const { c } = await registered(t.app, 'reset@example.com');
    await client(t.app).post('/auth/password/forgot', { email: 'reset@example.com' });
    const mail = t.email.sent.find((m) => m.subject.includes('Reset'))!;
    const token = /token=([\w-]+)/.exec(mail.text)![1]!;
    const r1 = await client(t.app).post('/auth/password/reset', { token, password: 'brand-new-pass-7' });
    expect(r1.status).toBe(200);
    expect((await client(t.app).post('/auth/password/reset', { token, password: 'another-pass-77' })).status).toBe(400);
    expect((await c.get('/auth/me')).status).toBe(401);
    expect((await client(t.app).post('/auth/login', { email: 'reset@example.com', password: 'brand-new-pass-7' })).status).toBe(200);
  });

  it('forgot-password does not reveal unknown accounts', async () => {
    const r = await client(t.app).post('/auth/password/forgot', { email: 'ghost@example.com' });
    expect(r.status).toBe(200);
    expect(t.email.sent).toHaveLength(0);
  });

  it('users cannot elevate their own role via settings', async () => {
    await registered(t.app);
    const { c, user } = await registered(t.app);
    const r = await c.patch('/me/settings', { role: 'admin', name: 'Eve' });
    expect(r.status).toBe(200);
    expect((await User.findById(user.id))!.role).toBe('user');
  });
});

describe('watchlists CRUD + isolation', () => {
  it('create, add, note, rename, remove, delete', async () => {
    const { c } = await registered(t.app);
    const wl = (await c.post('/watchlists', { name: 'Tech' })).body;
    expect((await c.post(`/watchlists/${wl.id}/items`, { symbol: 'msft', note: 'cloud' })).status).toBe(201);
    expect((await c.post(`/watchlists/${wl.id}/items`, { symbol: 'MSFT' })).status).toBe(409);
    expect((await c.post(`/watchlists/${wl.id}/items`, { symbol: 'BAD SYM!' })).status).toBe(400);
    const got = (await c.get(`/watchlists/${wl.id}`)).body;
    expect(got.items[0]).toMatchObject({ symbol: 'MSFT', note: 'cloud' });
    expect(got.items[0].quote.freshness).toBe('delayed');
    expect((await c.patch(`/watchlists/${wl.id}/items/MSFT`, { note: 'azure' })).body.items[0].note).toBe('azure');
    expect((await c.patch(`/watchlists/${wl.id}`, { name: 'Big Tech' })).body.name).toBe('Big Tech');
    expect((await c.del(`/watchlists/${wl.id}/items/MSFT`)).body.items).toHaveLength(0);
    expect((await c.del(`/watchlists/${wl.id}`)).status).toBe(200);
    expect((await c.get('/watchlists')).body.items).toHaveLength(0);
  });

  it("another user's watchlist is 404 for every verb", async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const wl = (await a.c.post('/watchlists', { name: 'Private' })).body;
    expect((await b.c.get(`/watchlists/${wl.id}`)).status).toBe(404);
    expect((await b.c.patch(`/watchlists/${wl.id}`, { name: 'pwned' })).status).toBe(404);
    expect((await b.c.post(`/watchlists/${wl.id}/items`, { symbol: 'AAPL' })).status).toBe(404);
    expect((await b.c.del(`/watchlists/${wl.id}`)).status).toBe(404);
    expect((await b.c.get('/watchlists')).body.items).toHaveLength(0);
    expect((await a.c.get(`/watchlists/${wl.id}`)).body.name).toBe('Private');
  });

  it('ignores a userId supplied in the body', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const r = await b.c.post('/watchlists', { name: 'Sneaky', userId: a.user.id });
    expect(r.status).toBe(201);
    expect(String(r.body.userId)).toBe(b.user.id);
  });

  it('unauthenticated requests are refused', async () => {
    expect((await request(t.app).get('/api/v1/watchlists')).status).toBe(401);
  });
});

describe('markets', () => {
  it('history returns bars trimmed to range with summary analytics', async () => {
    const { c } = await registered(t.app);
    const r = await c.get('/markets/AAPL/history?range=3M');
    expect(r.status).toBe(200);
    expect(r.body.bars.length).toBeGreaterThan(55);
    expect(r.body.bars.length).toBeLessThan(70);
    expect(r.body.summary.observations).toBe(r.body.bars.length);
    expect(r.body.freshness).toBe('eod');
    expect(r.body.provider).toBe('Twelve Data');
  });
  it('caches quotes (one provider call for repeated requests)', async () => {
    const { c } = await registered(t.app);
    await c.get('/markets/AAPL');
    const n = t.market.calls;
    await c.get('/markets/AAPL');
    expect(t.market.calls).toBe(n);
  });
  it('provider failure is reported per sub-request, not fabricated', async () => {
    const { c } = await registered(t.app);
    t.market.failing.add('ZZZZ');
    const r = await c.get('/markets/ZZZZ');
    expect(r.body.quote.data ?? null).toBeNull();
    expect(r.body.quote.error.message).toMatch(/not found/);
  });
  it('not-configured provider returns 503 with a hint', async () => {
    const t2 = await buildTestApp({ market: false });
    const { c } = await registered(t2.app);
    const r = await c.get('/markets/AAPL/history');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('integration_not_configured');
    expect(r.body.error.details.hint).toMatch(/TWELVE_DATA_API_KEY/);
    const ov = await c.get('/markets/overview');
    expect(ov.body.configured).toBe(false);
  });
  it('compare computes correlation on common dates', async () => {
    const { c } = await registered(t.app);
    const r = await c.get('/markets/compare?symbols=AAPL,MSFT&range=6M');
    expect(r.status).toBe(200);
    expect(r.body.correlation.symbols).toEqual(['AAPL', 'MSFT']);
    expect(r.body.correlation.matrix[0][0]).toBe(1);
  });
});

describe('portfolio lab', () => {
  it('CRUD + analytics with unpriced and currency-mismatched positions reported, not valued', async () => {
    const { c } = await registered(t.app);
    t.market.prices = { AAA: { price: 60, previousClose: 59 }, BBB: { price: 120, previousClose: 118 } };
    t.market.failing.add('DEAD');
    const p = (
      await c.post('/portfolios', {
        name: 'Learning',
        positions: [
          { symbol: 'AAA', quantity: 10, averageCost: 50 },
          { symbol: 'BBB', quantity: 5, averageCost: 100 },
          { symbol: 'DEAD', quantity: 1, averageCost: 10 },
          { symbol: 'INR1', quantity: 1, averageCost: 10, currency: 'INR' },
        ],
      })
    ).body;
    expect(p.kind).toBe('hypothetical');
    const a = (await c.get(`/portfolios/${p.id}/analytics?range=6M`)).body;
    const usd = a.valuation.totals.find((x: { currency: string }) => x.currency === 'USD');
    expect(usd.value).toBe(1200);
    expect(usd.unrealizedPnL).toBe(200);
    expect(a.valuation.unvalued).toEqual(expect.arrayContaining(['DEAD', 'INR1']));
    expect(a.currencyMismatches[0]).toMatch(/INR1/);
    expect(a.history).toBeNull(); // multi-currency → historical analytics disabled
    expect(a.assumptions.join(' ')).toMatch(/Hypothetical/);
  });
  it('single-currency portfolio gets history, drawdown and benchmark', async () => {
    const { c } = await registered(t.app);
    const p = (await c.post('/portfolios', { name: 'US', positions: [{ symbol: 'AAA', quantity: 1, averageCost: 1 }, { symbol: 'BBB', quantity: 2, averageCost: 1 }] })).body;
    const a = (await c.get(`/portfolios/${p.id}/analytics?range=6M`)).body;
    expect(a.history.series.length).toBeGreaterThan(100);
    expect(a.history.maxDrawdown.maxDrawdown).toBeLessThanOrEqual(0);
    expect(a.history.benchmark.symbol).toBe('SPY');
  });
  it('isolation', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const p = (await a.c.post('/portfolios', { name: 'Mine' })).body;
    expect((await b.c.get(`/portfolios/${p.id}`)).status).toBe(404);
    expect((await b.c.patch(`/portfolios/${p.id}`, { name: 'x' })).status).toBe(404);
    expect((await b.c.get(`/portfolios/${p.id}/analytics`)).status).toBe(404);
  });
});

describe('alerts & notifications', () => {
  it('triggers once per cooldown window and records delivery honestly', async () => {
    const { c, user } = await registered(t.app);
    t.market.prices.NVDA = { price: 150, previousClose: 140 };
    await c.patch('/me/settings', { notificationPrefs: { email: true } });
    const a = (await c.post('/alerts', { symbol: 'NVDA', type: 'price_above', threshold: 145, channels: ['in_app', 'email', 'webhook'] })).body;
    const r1 = await c.post('/alerts/evaluate');
    expect(r1.body).toMatchObject({ evaluated: 1, triggered: 1 });
    const r2 = await c.post('/alerts/evaluate');
    expect(r2.body).toMatchObject({ triggered: 0, suppressedByCooldown: 1 });
    expect(await AlertEvent.countDocuments({ alertId: a.id })).toBe(1);
    const n = await Notification.findOne({ userId: user.id, kind: 'alert_triggered' });
    const byCh = Object.fromEntries(n!.deliveries.map((d) => [d.channel, d.status]));
    expect(byCh).toEqual({ in_app: 'delivered', email: 'delivered', webhook: 'skipped' });
    expect(t.email.sent.some((m) => m.subject.includes('NVDA'))).toBe(true);
  });

  it('never marks email delivered when the provider fails or is absent', async () => {
    const t2 = await buildTestApp({ email: false });
    const { c } = await registered(t2.app);
    await c.patch('/me/settings', { notificationPrefs: { email: true } });
    const r = await c.post('/notifications/test');
    const email = r.body.deliveries.find((d: { channel: string }) => d.channel === 'email');
    expect(email.status).toBe('skipped');
    expect(email.error).toMatch(/not configured/);

    const { c: c3 } = await registered(t.app);
    await c3.patch('/me/settings', { notificationPrefs: { email: true } });
    t.email.fail = true;
    const r3 = await c3.post('/notifications/test');
    expect(r3.body.deliveries.find((d: { channel: string }) => d.channel === 'email').status).toBe('failed');
  });

  it('no quote → no trigger', async () => {
    const { c } = await registered(t.app);
    t.market.failing.add('GONE');
    await c.post('/alerts', { symbol: 'GONE', type: 'price_below', threshold: 1000 });
    const r = await c.post('/alerts/evaluate');
    expect(r.body).toMatchObject({ triggered: 0, quoteErrors: 1 });
  });

  it('notification center: list, unread count, mark read; isolation', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    await a.c.post('/notifications/test');
    const list = (await a.c.get('/notifications')).body;
    expect(list.unreadCount).toBe(1);
    expect((await b.c.post(`/notifications/${list.items[0].id}/read`)).status).toBe(404);
    expect((await a.c.post(`/notifications/${list.items[0].id}/read`)).status).toBe(200);
    expect((await a.c.get('/notifications')).body.unreadCount).toBe(0);
  });

  it('webhook URLs pointing at private networks are rejected', async () => {
    const { c } = await registered(t.app);
    const r = await c.patch('/me/settings', { notificationPrefs: { webhook: true, webhookUrl: 'https://169.254.169.254/latest' } });
    expect(r.status).toBe(400);
  });

  it('alert on a foreign watchlist is refused', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const wl = (await a.c.post('/watchlists', { name: 'A' })).body;
    expect((await b.c.post('/alerts', { symbol: 'AAPL', type: 'price_above', threshold: 1, watchlistId: wl.id })).status).toBe(404);
  });
});

describe('research pipeline', () => {
  const NEWS_SUMMARY = 'Acme Corp said quarterly revenue rose 12 percent to $4.2 billion, driven by cloud subscriptions.';
  const goodOutput = (sourceId: string, evidence: string) =>
    JSON.stringify({
      executiveSummary: 'Acme reported higher revenue.',
      keyFindings: [
        { text: 'Revenue rose 12% to $4.2B.', basis: 'source_reported', citations: [{ sourceId, evidence }] },
        { text: 'Revenue rose 40%.', basis: 'source_reported', citations: [{ sourceId, evidence: 'revenue rose 40 percent to a record high' }] },
        { text: 'Shares trended up over the year.', basis: 'calculated', citations: [] },
      ],
      bullishFactors: [],
      bearishFactors: [],
      risks: [],
      uncertainties: ['Single news source.'],
      followUpQuestions: ['What drove subscription growth?'],
      limitations: [],
      evidenceStrength: 'moderate',
    });

  beforeEach(() => {
    t.fundamentals.news = [
      { id: '1', symbol: 'ACME', headline: 'Acme revenue climbs on cloud demand', summary: NEWS_SUMMARY, url: 'https://news.example.com/acme?utm_source=x', source: 'Example Wire', publishedAt: new Date(FIXTURE_NOW.getTime() - 86_400_000).toISOString(), provider: 'Finnhub' },
      { id: '2', symbol: 'ACME', headline: 'Acme revenue climbs on cloud demand - syndicated', summary: NEWS_SUMMARY, url: 'https://other.example.com/copy', source: 'Copy Desk', publishedAt: new Date(FIXTURE_NOW.getTime() - 2 * 86_400_000).toISOString(), provider: 'Finnhub' },
    ];
  });

  it('end-to-end: sources deduped, prompt isolates sources, citations verified, fabricated ones downgraded', async () => {
    const { c } = await registered(t.app);
    t.llm.responses.push(goodOutput('S1', 'quarterly revenue rose 12 percent to $4.2 billion'));
    const r = await c.post('/research', { question: 'What changed for Acme this week?', symbols: ['acme'], task: 'company_update', lookbackDays: 7 });
    expect(r.status).toBe(201);
    const rep = r.body.report;
    expect(rep.symbols).toEqual(['ACME']);
    expect(rep.sourceReferences).toHaveLength(1); // syndicated duplicate removed
    expect(rep.keyFindings.map((k: { basis: string }) => k.basis)).toEqual(['source_reported', 'unverified', 'calculated']);
    expect(rep.keyFindings[0].citations[0].sourceId).toBe('S1');
    expect(rep.keyFindings[1].citations).toEqual([]);
    expect(rep.citationStats).toMatchObject({ verified: 1, downgraded: 1 });
    expect(rep.limitations.join(' ')).toMatch(/unverified/);
    expect(rep.disclaimer).toMatch(/not individualized financial advice/);
    expect(rep.financialMetrics.ACME.oneYear.observations).toBeGreaterThan(200);
    const req = t.llm.requests[0]!;
    expect(req.system).toMatch(/UNTRUSTED DATA/);
    expect(req.user).toContain('<source id="S1"');
    expect(await SourceDocument.countDocuments()).toBe(2);
    // persisted & retrievable
    const got = await c.get(`/reports/${r.body.reportId}`);
    expect(got.body.keyFindings[0].citations[0].evidence).toMatch(/12 percent/);
  });

  it('repairs once on invalid output, then fails the run cleanly', async () => {
    const { c } = await registered(t.app);
    t.llm.responses.push('{"executiveSummary": 3}', goodOutput('S1', 'quarterly revenue rose 12 percent to $4.2 billion'));
    expect((await c.post('/research', { question: 'Summarize Acme news', symbols: ['ACME'] })).status).toBe(201);
    expect(t.llm.requests).toHaveLength(2);
    expect(t.llm.requests[1]!.user).toMatch(/failed validation/);

    t.llm.responses.push('nope', 'still nope');
    const bad = await c.post('/research', { question: 'Summarize Acme news', symbols: ['ACME'] });
    expect(bad.status).toBe(500);
    const runs = (await c.get('/research/runs')).body.items;
    expect(runs[0].status).toBe('failed');
    expect(runs[0].error).toMatch(/validation twice/);
  });

  it('without an LLM, produces a data-only report and says so', async () => {
    const t2 = await buildTestApp({ llm: false });
    const { c } = await registered(t2.app);
    const r = await c.post('/research', { question: 'How has AAPL performed?', symbols: ['AAPL'] });
    expect(r.status).toBe(201);
    expect(r.body.report.model).toMatch(/data-only/);
    expect(r.body.report.keyFindings.every((k: { basis: string }) => k.basis === 'calculated')).toBe(true);
    expect(r.body.report.limitations.join(' ')).toMatch(/GEMINI_API_KEY/);
  });

  it('reports: search, save, share link, isolation', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    t.llm.responses.push(goodOutput('S1', 'quarterly revenue rose 12 percent to $4.2 billion'));
    const id = (await a.c.post('/research', { question: 'Acme revenue update', symbols: ['ACME'] })).body.reportId;
    expect((await b.c.get(`/reports/${id}`)).status).toBe(404);
    expect((await a.c.patch(`/reports/${id}`, { saved: true })).body.saved).toBe(true);
    expect((await a.c.get('/reports?saved=true')).body.total).toBe(1);
    expect((await a.c.get('/reports?q=revenue')).body.total).toBe(1);
    const share = (await a.c.post(`/reports/${id}/share`, { enabled: true })).body;
    const pub = await request(t.app).get(`/api/v1/reports/shared/${share.shareToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body).not.toHaveProperty('userId');
    await a.c.post(`/reports/${id}/share`, { enabled: false });
    // a user can hold many unshared reports (regression: null share tokens collided in the unique index)
    t.llm.responses.push(goodOutput('S1', 'quarterly revenue rose 12 percent to $4.2 billion'), goodOutput('S1', 'quarterly revenue rose 12 percent to $4.2 billion'));
    expect((await a.c.post('/research', { question: 'Acme follow-up one', symbols: ['ACME'] })).status).toBe(201);
    expect((await a.c.post('/research', { question: 'Acme follow-up two', symbols: ['ACME'] })).status).toBe(201);
    expect((await request(t.app).get(`/api/v1/reports/shared/${share.shareToken}`)).status).toBe(404);
  });

  it('enforces the per-user daily research limit', async () => {
    const t2 = await buildTestApp({ llm: false }, { RESEARCH_DAILY_LIMIT_PER_USER: '1' });
    const { c } = await registered(t2.app);
    expect((await c.post('/research', { question: 'How has AAPL performed?', symbols: ['AAPL'] })).status).toBe(201);
    expect((await c.post('/research', { question: 'How has AAPL performed?', symbols: ['AAPL'] })).status).toBe(429);
  });

  it('uploads: text accepted & owner-scoped; disguised binaries rejected', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const up = await a.c.agent.post('/api/v1/research/documents/upload').set('X-AlphaPulse-CSRF', '1').field('symbols', 'ACME').attach('file', Buffer.from('Acme risk factors: supply chain concentration.'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect((await b.c.get(`/research/documents/${up.body.id}`)).status).toBe(404);
    expect((await a.c.get(`/research/documents/${up.body.id}`)).body.text).toMatch(/supply chain/);
    const fakePdf = await a.c.agent.post('/api/v1/research/documents/upload').set('X-AlphaPulse-CSRF', '1').attach('file', Buffer.from('MZ\x90\x00 not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(fakePdf.status).toBe(415);
    const exe = await a.c.agent.post('/api/v1/research/documents/upload').set('X-AlphaPulse-CSRF', '1').attach('file', Buffer.from('x'), { filename: 'x.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(415);
  });
});

describe('workflows', () => {
  it('admin-only changes and manual runs; executions recorded', async () => {
    const admin = await registered(t.app);
    const user = await registered(t.app);
    expect((await user.c.post('/automations/source_health/run')).status).toBe(403);
    expect((await user.c.patch('/automations/source_health', { enabled: true })).status).toBe(403);
    const r = await admin.c.post('/automations/source_health/run');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('succeeded');
    const execs = (await user.c.get('/automations/executions')).body.items;
    expect(execs[0]).toMatchObject({ workflowKey: 'source_health', trigger: 'manual', status: 'succeeded' });
    expect(await AuditEvent.countDocuments({ action: 'workflow.manual_run' })).toBe(1);
  });

  it('daily brief skips non-trading days and generates briefs on trading days', async () => {
    const admin = await registered(t.app);
    const wl = (await admin.c.post('/watchlists', { name: 'W' })).body;
    await admin.c.post(`/watchlists/${wl.id}/items`, { symbol: 'AAPL' });
    t.llm.responses.push(
      JSON.stringify({ executiveSummary: 'Brief.', keyFindings: [], bullishFactors: [], bearishFactors: [], risks: [], uncertainties: [], followUpQuestions: [], limitations: [], evidenceStrength: 'weak' }),
    );
    const r = await admin.c.post('/automations/daily_brief/run');
    expect(r.body.status).toBe('succeeded');
    expect(r.body.metrics).toMatchObject({ generated: 1, date: '2026-10-21' });
    expect(await ResearchReport.countDocuments({ kind: 'daily_brief' })).toBe(1);
    expect(await Notification.countDocuments({ kind: 'brief_ready' })).toBe(1);

    const weekend = await buildTestApp();
    weekend.ctx.deps.now = () => new Date('2026-10-24T12:00:00Z');
    const r2 = await weekend.ctx.workflows.run('daily_brief', 'manual');
    expect(r2.status).toBe('skipped');
  });

  it('n8n webhook: signature required, workflow must be enabled for n8n, idempotent per bucket', async () => {
    const send = (bodyObj: object, opts: { ts?: string; sig?: string } = {}) => {
      const raw = JSON.stringify(bodyObj);
      const ts = opts.ts ?? String(Date.now());
      return request(t.app)
        .post('/api/v1/hooks/n8n/run')
        .set('content-type', 'application/json')
        .set('x-alphapulse-timestamp', ts)
        .set('x-alphapulse-signature', opts.sig ?? signPayload('n8n-test-secret', ts, raw))
        .send(raw);
    };
    expect((await send({ workflow: 'source_health' }, { sig: 'sha256=deadbeef' })).status).toBe(401);
    expect((await send({ workflow: 'source_health' })).status).toBe(409); // not enabled for n8n
    await WorkflowDefinition.updateOne({ key: 'source_health' }, { enabled: true, trigger: 'n8n' });
    const first = await send({ workflow: 'source_health' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('succeeded');
    const dup = await send({ workflow: 'source_health' });
    expect(dup.body).toMatchObject({ status: 'skipped', reason: 'duplicate' });
    expect(await WorkflowExecution.countDocuments({ workflowKey: 'source_health' })).toBe(1);
  });

  it('failed workflows are recorded and admins notified; manual rerun allowed', async () => {
    const admin = await registered(t.app);
    await WorkflowDefinition.updateOne({ key: 'watchlist_monitor' }, { maxRetries: 0 });
    await Alert.create({ userId: admin.user.id, symbol: 'AAPL', type: 'price_above', threshold: 1 });
    const orig = t.ctx.markets.quotes.bind(t.ctx.markets);
    t.ctx.markets.quotes = async () => {
      throw new Error('provider exploded');
    };
    const r = await admin.c.post('/automations/watchlist_monitor/run');
    expect(r.status).toBe(500);
    expect(await Notification.countDocuments({ kind: 'workflow_failed' })).toBe(1);
    t.ctx.markets.quotes = orig;
    const rerun = await admin.c.post('/automations/watchlist_monitor/run', { rerunOf: r.body.executionId });
    expect(rerun.body.status).toBe('succeeded');
    const ex = await WorkflowExecution.findById(rerun.body.executionId);
    expect(String(ex!.rerunOf)).toBe(r.body.executionId);
  });

  it('source health records not-configured providers honestly', async () => {
    const t2 = await buildTestApp({ market: false, fundamentals: false });
    await registered(t2.app);
    const r = await t2.ctx.workflows.run('source_health', 'manual');
    const res = (r as unknown as { metrics: { results: { provider: string; status: string }[] } }).metrics.results;
    expect(res.every((x) => x.status === 'not_configured')).toBe(true);
  });
});

describe('admin', () => {
  it('role changes are admin-only, audited, and cannot remove the last admin', async () => {
    const admin = await registered(t.app);
    const user = await registered(t.app);
    expect((await user.c.patch(`/admin/users/${user.user.id}/role`, { role: 'admin' })).status).toBe(403);
    expect((await admin.c.patch(`/admin/users/${admin.user.id}/role`, { role: 'user' })).status).toBe(400);
    expect((await admin.c.patch(`/admin/users/${user.user.id}/role`, { role: 'admin' })).status).toBe(200);
    expect(await AuditEvent.countDocuments({ action: 'admin.role_changed' })).toBe(1);
  });

  it('account deletion removes all owned data', async () => {
    const { c, user } = await registered(t.app);
    await c.post('/watchlists', { name: 'x' });
    await c.post('/alerts', { symbol: 'AAPL', type: 'price_above', threshold: 1 });
    expect((await c.del('/me', { password: 'wrong' })).status).toBe(400);
    expect((await c.del('/me', { password: 'correct-horse-9' })).status).toBe(200);
    expect(await User.countDocuments({ _id: user.id })).toBe(0);
    expect(await Alert.countDocuments({ userId: user.id })).toBe(0);
  });
});

describe('ingestion concurrency', () => {
  it('concurrent upserts of the same source converge on one document without errors', async () => {
    const input = { kind: 'news' as const, origin: 'secondary' as const, provider: 'P', url: 'https://ex.com/a', title: 'Same', text: 'same text', symbols: ['X'] };
    const docs = await Promise.all(Array.from({ length: 12 }, () => upsertSource(input)));
    expect(new Set(docs.map((d) => String(d!._id))).size).toBe(1);
    expect(await SourceDocument.countDocuments()).toBe(1);
  });
});
