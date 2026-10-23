import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import type { WorkflowKey } from '@alphapulse/shared';
import type { Deps } from '../deps.js';
import { ProviderHealth, ResearchReport, User, Watchlist, WorkflowDefinition, WorkflowExecution } from '../models/index.js';
import { evaluateAllAlerts } from './alerts.js';
import { isoWeekKey, isUsTradingDay } from './calendar.js';
import type { MarketService } from './markets.js';
import type { NotificationService } from './notifications.js';
import type { ResearchService } from './research.js';

export const WORKFLOW_DEFAULTS: Record<WorkflowKey, { name: string; description: string; schedule: string; timezone: string; timeoutMs: number; maxRetries: number }> = {
  daily_brief: {
    name: 'Daily market brief',
    description: 'On US trading days: fetch market data, recent news and filings for each user’s watchlists, generate a cited brief, save and deliver it.',
    schedule: '30 7 * * 1-5',
    timezone: 'America/New_York',
    timeoutMs: 10 * 60_000,
    maxRetries: 1,
  },
  watchlist_monitor: {
    name: 'Watchlist event monitor',
    description: 'Evaluate price-threshold and percentage-move alerts, deduplicate events, notify.',
    schedule: '*/15 9-16 * * 1-5',
    timezone: 'America/New_York',
    timeoutMs: 2 * 60_000,
    maxRetries: 2,
  },
  weekly_digest: {
    name: 'Weekly research digest',
    description: 'Summarize the week’s saved research and new sources into a cited digest per user.',
    schedule: '0 9 * * 6',
    timezone: 'America/New_York',
    timeoutMs: 10 * 60_000,
    maxRetries: 1,
  },
  source_health: {
    name: 'Data source health monitor',
    description: 'Check provider availability and data staleness; record results; alert admins on failures.',
    schedule: '0 * * * *',
    timezone: 'UTC',
    timeoutMs: 60_000,
    maxRetries: 2,
  },
};

/** Idempotency bucket per workflow: scheduled/n8n triggers within the same bucket run once. */
export function idempotencyKey(key: WorkflowKey, trigger: 'scheduler' | 'n8n' | 'manual', now: Date): string {
  if (trigger === 'manual') return `${key}:manual:${randomUUID()}`;
  switch (key) {
    case 'daily_brief':
      return `${key}:${isUsTradingDay(now).date}`;
    case 'weekly_digest':
      return `${key}:${isoWeekKey(now)}`;
    case 'watchlist_monitor':
      return `${key}:${Math.floor(now.getTime() / (15 * 60_000))}`;
    case 'source_health':
      return `${key}:${now.toISOString().slice(0, 13)}`;
  }
}

export async function ensureWorkflowDefinitions() {
  for (const [key, d] of Object.entries(WORKFLOW_DEFAULTS)) {
    await WorkflowDefinition.updateOne({ key: key as WorkflowKey }, { $setOnInsert: { key: key as WorkflowKey, ...d, enabled: false, trigger: 'manual' } }, { upsert: true });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`Timed out after ${ms} ms`)), ms);
    }),
  ]);
}

export class WorkflowService {
  constructor(
    private readonly deps: Deps,
    private readonly markets: MarketService,
    private readonly notifications: NotificationService,
    private readonly research: ResearchService,
  ) {}

  /**
   * Runs a workflow with idempotency, timeout, bounded retries and an execution record.
   * Returns { status: 'skipped', reason: 'duplicate' } if this bucket already ran.
   */
  async run(key: WorkflowKey, trigger: 'scheduler' | 'n8n' | 'manual', opts: { triggeredBy?: Types.ObjectId | null; rerunOf?: string | null; force?: boolean } = {}) {
    const def = await WorkflowDefinition.findOne({ key });
    if (!def) throw new Error(`Unknown workflow ${key}`);
    if (!def.enabled && trigger !== 'manual') {
      return { status: 'skipped' as const, reason: 'workflow disabled', executionId: null };
    }
    const now = this.deps.now();
    const idem = opts.rerunOf || opts.force ? `${key}:manual:${randomUUID()}` : idempotencyKey(key, trigger, now);
    let exec;
    try {
      exec = await WorkflowExecution.create({
        workflowKey: key,
        idempotencyKey: idem,
        trigger,
        triggeredBy: opts.triggeredBy ?? null,
        status: 'running',
        startedAt: now,
        rerunOf: opts.rerunOf ?? null,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return { status: 'skipped' as const, reason: 'duplicate', executionId: null };
      throw e;
    }

    let attempt = 0;
    let lastErr: Error | null = null;
    while (attempt <= def.maxRetries) {
      attempt++;
      try {
        const metrics = await withTimeout(this.handler(key), def.timeoutMs);
        const finished = this.deps.now();
        exec.set({ status: metrics.skipped ? 'skipped' : 'succeeded', attempt, metrics, finishedAt: finished, durationMs: finished.getTime() - exec.startedAt.getTime() });
        await exec.save();
        await WorkflowDefinition.updateOne({ key }, { lastRunAt: finished, lastStatus: exec.status });
        return { status: exec.status as 'succeeded' | 'skipped', executionId: String(exec._id), metrics };
      } catch (e) {
        lastErr = e as Error;
        this.deps.logger.warn({ workflow: key, attempt, err: lastErr.message }, 'workflow attempt failed');
        if (attempt <= def.maxRetries) await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt)));
      }
    }
    const finished = this.deps.now();
    exec.set({ status: 'failed', attempt, error: lastErr?.message.slice(0, 1000) ?? 'unknown', finishedAt: finished, durationMs: finished.getTime() - exec.startedAt.getTime() });
    await exec.save();
    await WorkflowDefinition.updateOne({ key }, { lastRunAt: finished, lastStatus: 'failed' });
    await this.notifications.notifyAdmins({
      kind: 'workflow_failed',
      title: `Workflow failed: ${def.name}`,
      body: `${lastErr?.message ?? 'unknown error'} (after ${attempt} attempt(s)).`,
      link: '/app/automations',
      dedupeKey: `wf-failed:${exec._id}`,
    });
    return { status: 'failed' as const, executionId: String(exec._id), error: lastErr?.message };
  }

  private handler(key: WorkflowKey): Promise<Record<string, unknown>> {
    switch (key) {
      case 'daily_brief':
        return this.dailyBrief();
      case 'watchlist_monitor':
        return evaluateAllAlerts(this.deps, this.markets, this.notifications) as unknown as Promise<Record<string, unknown>>;
      case 'weekly_digest':
        return this.weeklyDigest();
      case 'source_health':
        return this.sourceHealth();
    }
  }

  private async dailyBrief(): Promise<Record<string, unknown>> {
    const day = isUsTradingDay(this.deps.now());
    if (!day.trading) return { skipped: true, reason: day.reason, date: day.date };
    const users = await User.find({ 'notificationPrefs.dailyBrief': true }).select('_id').limit(500);
    let generated = 0;
    let noWatchlist = 0;
    const failures: string[] = [];
    for (const u of users) {
      const wls = await Watchlist.find({ userId: u._id }).select('items.symbol').lean();
      const symbols = [...new Set(wls.flatMap((w) => w.items.map((i) => i.symbol)))].slice(0, 5);
      if (!symbols.length) {
        noWatchlist++;
        continue;
      }
      try {
        const { report } = await this.research.run(
          { question: `Morning brief for ${day.date}: what changed for my watchlist and what should I watch today?`, symbols, task: 'morning_brief', lookbackDays: 3, documentIds: [] },
          { userId: u._id, kind: 'daily_brief', title: `Daily brief for ${day.date}` },
        );
        generated++;
        await this.notifications.notify({
          userId: u._id,
          kind: 'brief_ready',
          title: `Your daily brief for ${day.date} is ready`,
          body: report.executiveSummary?.slice(0, 600) ?? '',
          link: `/app/reports/${report._id}`,
          dedupeKey: `brief:${day.date}`,
          channels: ['in_app', 'email'],
        });
      } catch (e) {
        failures.push(`${u._id}: ${(e as Error).message}`);
      }
    }
    if (failures.length && failures.length === users.length - noWatchlist && generated === 0) {
      throw new Error(`All briefs failed: ${failures[0]}`);
    }
    return { date: day.date, calendarKnown: day.calendarKnown, users: users.length, generated, noWatchlist, failures: failures.length };
  }

  private async weeklyDigest(): Promise<Record<string, unknown>> {
    const week = isoWeekKey(this.deps.now());
    const since = new Date(this.deps.now().getTime() - 7 * 86_400_000);
    const users = await User.find({ 'notificationPrefs.weeklyDigest': true }).select('_id').limit(500);
    let generated = 0;
    let noActivity = 0;
    for (const u of users) {
      const reports = await ResearchReport.find({ userId: u._id, generatedAt: { $gte: since }, kind: { $ne: 'weekly_digest' } }).select('symbols title').lean();
      const symbols = [...new Set(reports.flatMap((r) => r.symbols))].slice(0, 5);
      if (!symbols.length) {
        noActivity++;
        continue;
      }
      const { report } = await this.research.run(
        {
          question: `Weekly digest (${week}): recurring themes and what changed this week across ${symbols.join(', ')}. Prior reports this week: ${reports.map((r) => r.title).slice(0, 10).join(' | ')}`,
          symbols,
          task: 'themes',
          lookbackDays: 7,
          documentIds: [],
        },
        { userId: u._id, kind: 'weekly_digest', title: `Weekly digest for ${week}` },
      );
      generated++;
      await this.notifications.notify({
        userId: u._id,
        kind: 'digest_ready',
        title: `Weekly research digest ${week}`,
        body: report.executiveSummary?.slice(0, 600) ?? '',
        link: `/app/reports/${report._id}`,
        dedupeKey: `digest:${week}`,
        channels: ['in_app', 'email'],
      });
    }
    return { week, users: users.length, generated, noActivity };
  }

  /** Cheap liveness probes; records ProviderHealth rows and alerts admins on failure (deduped per hour). */
  async sourceHealth(): Promise<Record<string, unknown>> {
    const now = this.deps.now();
    const results: { provider: string; status: string; latencyMs?: number; detail?: string; stale?: boolean }[] = [];
    const probe = async (provider: string, configured: boolean, fn: () => Promise<{ detail?: string; asOf?: string | null }>) => {
      if (!configured) {
        results.push({ provider, status: 'not_configured' });
        await ProviderHealth.create({ provider, status: 'not_configured', checkedAt: now });
        return;
      }
      const t0 = Date.now();
      try {
        const r = await fn();
        const latencyMs = Date.now() - t0;
        const asOf = r.asOf ? new Date(r.asOf) : null;
        // Stale: last daily bar older than 4 calendar days (covers weekends + one holiday).
        const stale = asOf ? now.getTime() - asOf.getTime() > 4 * 86_400_000 : false;
        const status = stale ? 'degraded' : 'ok';
        results.push({ provider, status, latencyMs, detail: r.detail, stale });
        this.markets.recordOk(provider, latencyMs);
        await ProviderHealth.create({ provider, status, latencyMs, checkedAt: now, detail: r.detail, lastDataAsOf: asOf, stale });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        results.push({ provider, status: 'down', detail: msg });
        this.markets.recordError(provider, msg);
        await ProviderHealth.create({ provider, status: 'down', checkedAt: now, detail: msg });
      }
    };
    await probe('Twelve Data', !!this.deps.market, async () => {
      const h = await this.deps.market!.getHistory('SPY', 5);
      return { detail: `${h.bars.length} bars`, asOf: h.asOf };
    });
    await probe('Finnhub', !!this.deps.fundamentals, async () => {
      const p = await this.deps.fundamentals!.getProfile('AAPL');
      return { detail: p.name ? 'profile ok' : 'empty profile' };
    });
    await probe('SEC EDGAR', !!this.deps.sec, async () => {
      const c = await this.deps.sec!.cikForTicker('AAPL');
      return { detail: c ? 'ticker map ok' : 'ticker map empty' };
    });
    const down = results.filter((r) => r.status === 'down' || r.status === 'degraded');
    if (down.length) {
      await this.notifications.notifyAdmins({
        kind: 'provider_down',
        title: `Data provider issue: ${down.map((d) => d.provider).join(', ')}`,
        body: down.map((d) => `${d.provider}: ${d.status}${d.detail ? ` — ${d.detail}` : ''}`).join('\n'),
        link: '/app/automations',
        dedupeKey: `health:${now.toISOString().slice(0, 13)}`,
      });
    }
    return { checked: results.length, results };
  }
}
