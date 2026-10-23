import type { AppContext } from '../context.js';
import { ResearchReport, ResearchRun, SourceDocument } from '../models/index.js';

/**
 * Opt-in boot self-test (SELF_TEST_ON_BOOT=true). Exercises every configured provider and one full research run
 * with the real credentials, logs a pass/fail line per check, then deletes what it created. It exposes no endpoint
 * and logs no secrets — only status, timings and error messages.
 */
export async function runSelfTest(ctx: AppContext) {
  const { logger } = ctx.deps;
  const results: { check: string; ok: boolean; ms: number; detail: string }[] = [];
  const check = async (name: string, fn: () => Promise<string>) => {
    const t = Date.now();
    try {
      results.push({ check: name, ok: true, ms: Date.now() - t, detail: (await fn()).slice(0, 200) });
    } catch (e) {
      results.push({ check: name, ok: false, ms: Date.now() - t, detail: (e as Error).message.slice(0, 300) });
    }
    const r = results.at(-1)!;
    r.ms = Date.now() - t;
    logger.info({ selfTest: r }, `self-test ${r.ok ? 'PASS' : 'FAIL'}: ${name}`);
  };
  const m = ctx.markets;
  const d = ctx.deps;

  if (d.market) {
    await check('twelve_data.quote AAPL', async () => {
      const q = await m.quote('AAPL');
      return `price ${q.price} ${q.currency} asOf ${q.asOf} (${q.freshness})`;
    });
    await check('twelve_data.history MSFT 1M', async () => {
      const h = await m.history('MSFT', '1M');
      return `${h.bars.length} bars, last ${h.bars.at(-1)?.date}`;
    });
    await check('markets.overview', async () => JSON.stringify(await m.overview()).slice(0, 200));
  }
  if (d.fundamentals) {
    await check('finnhub.profile NVDA', async () => {
      const p = await m.profile('NVDA');
      return `${p.name} · ${p.industry}`;
    });
    await check('finnhub.metrics NVDA', async () => `${(await m.metrics('NVDA')).metrics.length} metrics`);
    await check('finnhub.market_news', async () => `${(await d.fundamentals!.getMarketNews()).length} headlines`);
  }
  if (d.sec) {
    await check('sec.recent_filings AAPL', async () => {
      const f = await d.sec!.recentFilings('AAPL', 365, 3);
      return f.map((x) => `${x.form} ${x.filingDate}`).join(', ') || 'no filings in window';
    });
  }
  if (d.llm) {
    await check(`llm.complete (${d.llm.name} ${d.llm.model})`, async () => {
      const r = await d.llm!.complete({
        system: 'Return JSON only.',
        user: 'Return {"ok": true}.',
        schemaName: 'ping',
        jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      });
      return `model ${r.model}: ${r.content.slice(0, 80)}`;
    });
  }

  // Full pipeline, owned by no user, cleaned up afterwards.
  let runId: unknown = null;
  await check('research.run AAPL (full pipeline)', async () => {
    const { run, report } = await ctx.research.run(
      { question: 'What are the most important recent developments for AAPL?', symbols: ['AAPL'], task: 'company_update', lookbackDays: 7, documentIds: [] } as never,
      { userId: null, title: '[self-test] AAPL' },
    );
    runId = run._id;
    const s = report.citationStats ?? { total: 0, verified: 0, downgraded: 0 };
    return `model ${report.model}; ${report.sourceReferences.length} sources; claims ${s.total} (verified ${s.verified}, downgraded ${s.downgraded}); steps ${run.steps.map((x) => `${x.name}:${x.status}`).join(' ')}`;
  });
  if (runId) {
    await ResearchReport.deleteMany({ runId });
    await ResearchRun.deleteOne({ _id: runId });
  }
  void SourceDocument; // source documents are a shared cache and are kept

  const failed = results.filter((r) => !r.ok);
  logger.info({ passed: results.length - failed.length, failed: failed.length, failures: failed.map((f) => f.check) }, `self-test finished: ${results.length - failed.length}/${results.length} passed`);
  return results;
}
