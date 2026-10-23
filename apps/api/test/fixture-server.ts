/**
 * LOCAL QA ONLY — never deployed. Runs the real API against a real MongoDB with SYNTHETIC providers so the UI's
 * populated states can be inspected without provider keys. Every provider is named "Fixture (synthetic)", so the UI
 * attributes all values to the fixture, never to a real data vendor.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/alphapulse_fixture npx tsx test/fixture-server.ts
 */
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { buildContext } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import type { Deps } from '../src/deps.js';
import { createLogger } from '../src/logger.js';
import { syncAllIndexes } from '../src/models/index.js';
import { DevOutbox } from '../src/providers/email.js';
import type { LlmRequest } from '../src/providers/llm.js';
import { ensureWorkflowDefinitions } from '../src/services/workflows.js';
import { FakeFundamentals, FakeMarket, FIXTURE_NOW } from './helpers.js';

const NAME = 'Fixture (synthetic)';

class FixtureMarket extends FakeMarket {
  override readonly name = NAME;
  override async getQuote(symbol: string) {
    const bars = (await this.getHistory(symbol, 2)).bars;
    const q = await super.getQuote(symbol);
    const price = bars.at(-1)!.close;
    const prev = bars.at(-2)!.close;
    return { ...q, name: `${symbol} (fixture)`, price, previousClose: prev, change: price - prev, changePct: price / prev - 1, provider: NAME };
  }
  override async getHistory(symbol: string, size: number) {
    const h = await super.getHistory(symbol, size);
    return { ...h, provider: NAME };
  }
}

class FixtureFundamentals extends FakeFundamentals {
  override readonly name = NAME;
}

/** Writes a structured note whose evidence passages are copied verbatim from the supplied source blocks. */
const fixtureLlm = {
  name: NAME,
  model: 'fixture/deterministic-writer',
  async complete(req: LlmRequest) {
    const blocks = [...req.user.matchAll(/<source id="(S\d+)"[^>]*>\nTITLE: ([^\n]*)\n([\s\S]*?)<\/source>/g)].map((m) => ({ id: m[1]!, title: m[2]!, text: m[3]!.trim() }));
    const cite = (b: (typeof blocks)[number] | undefined) => (b ? [{ sourceId: b.id, evidence: b.text.split('\n').find((l) => l.length > 30)?.slice(0, 90) ?? b.title }] : []);
    const [a, b] = blocks;
    const report = {
      executiveSummary: 'Fixture output for UI review. The figures below come from synthetic data; source-reported lines quote the stored fixture sources verbatim.',
      keyFindings: [
        ...(a ? [{ text: `The most recent source reports: ${a.title}.`, basis: 'source_reported', citations: cite(a) }] : []),
        { text: 'Over the one-year window the synthetic series rose with moderate volatility.', basis: 'calculated', citations: [] },
        { text: 'The pattern suggests steady demand, though this is the model’s reading of limited evidence.', basis: 'interpretation', citations: [] },
        { text: 'Margins expanded by 400 basis points.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'operating margin expanded by 400 basis points year over year' }] },
      ],
      bullishFactors: b ? [{ text: b.title, basis: 'source_reported', citations: cite(b) }] : [],
      bearishFactors: [{ text: 'If order growth slows, the valuation could compress.', basis: 'speculative', citations: [] }],
      risks: a ? [{ text: 'Coverage relies on a small number of news items.', basis: 'interpretation', citations: [] }] : [],
      uncertainties: ['Only fixture sources were available.'],
      followUpQuestions: ['What does the next filing say about order backlog?'],
      limitations: ['Synthetic fixture data — not market data.'],
      evidenceStrength: blocks.length >= 2 ? 'moderate' : 'weak',
    };
    return { content: JSON.stringify(report), model: this.model, usage: { promptTokens: 0, completionTokens: 0 } };
  },
};

async function main() {
  const config = loadConfig({ ...process.env, NODE_ENV: 'development', N8N_WEBHOOK_SECRET: 'fixture-secret', SCHEDULER_ENABLED: 'true' });
  await mongoose.connect(config.MONGODB_URI!);
  await syncAllIndexes();
  await ensureWorkflowDefinitions();
  const fundamentals = new FixtureFundamentals();
  const day = 86_400_000;
  fundamentals.news = ['AAPL', 'MSFT', 'NVDA'].flatMap((s, i) => [
    { id: `${s}-1`, symbol: s, headline: `${s} fixture headline: services segment leads quarterly growth`, summary: `Synthetic summary for ${s}. Services revenue rose while hardware was flat, according to the fixture newswire.`, url: `https://fixture.invalid/${s.toLowerCase()}/1`, source: 'Fixture Wire', publishedAt: new Date(FIXTURE_NOW.getTime() - (i + 1) * day).toISOString(), provider: NAME },
    { id: `${s}-2`, symbol: s, headline: `${s} fixture headline: supplier capacity expands ahead of launch cycle`, summary: `Synthetic summary for ${s}. Suppliers added capacity for the next product cycle, the fixture report says.`, url: `https://fixture.invalid/${s.toLowerCase()}/2`, source: 'Fixture Daily', publishedAt: new Date(FIXTURE_NOW.getTime() - (i + 3) * day).toISOString(), provider: NAME },
  ]);
  const deps: Deps = {
    config,
    logger: createLogger('info'),
    market: new FixtureMarket(),
    fundamentals,
    sec: null,
    llm: fixtureLlm,
    email: null,
    devOutbox: new DevOutbox(),
    safeFetch: (await import('../src/lib/safeFetch.js')).safeFetch,
    now: () => new Date(),
  };
  const ctx = await buildContext(deps, { startScheduler: false });
  createApp(ctx).listen(config.PORT, () => console.log(`FIXTURE API on :${config.PORT} — synthetic data only`));
}

void main();
