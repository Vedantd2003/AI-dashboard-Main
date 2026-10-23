'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { compact, cx, money, pct, relative } from '@/lib/format';
import { useApiMutation, useMe } from '@/lib/hooks';
import type { Alert, NewsItem, Paged, Quote, Report, Watchlist, WorkflowDef } from '@/lib/types';
import { Badge, Delta, FreshnessBadge, StatusDot } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, PageHeader, Panel, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState, NotConfigured } from '@/components/ui/states';
import { ActivityBars, AnimatedArea, DayRange, MoversChart, Ring, StatTile, VIZ, type ActivityDay, type MoverRow } from '@/components/dashboard-charts';

const WIDGETS = [
  { key: 'pulse', label: 'Key numbers' },
  { key: 'market', label: 'Market overview' },
  { key: 'movers', label: 'Today’s moves' },
  { key: 'performance', label: 'Price performance chart' },
  { key: 'evidence', label: 'Research evidence quality' },
  { key: 'allocation', label: 'Portfolio allocation' },
  { key: 'activity', label: 'Automation activity' },
  { key: 'watchlists', label: 'Watchlists' },
  { key: 'headlines', label: 'Headlines' },
  { key: 'research', label: 'Recent research' },
  { key: 'alerts', label: 'Active alerts' },
  { key: 'workflows', label: 'Automations' },
  { key: 'health', label: 'Data and pipeline health' },
] as const;
/** Chart widgets added later: users whose saved layout predates them get them switched on once. */
const CHART_KEYS = ['pulse', 'movers', 'performance', 'evidence', 'allocation', 'activity'];

interface Overview {
  configured: boolean;
  proxies: { symbol: string; label: string; quote: Quote | null; error: string | null }[];
  marketState: { isOpen: boolean | null; exchange: string } | null;
  note: string;
}

function MarketWidget() {
  const q = useQuery({ queryKey: ['markets', 'overview'], queryFn: () => api.get<Overview>('/markets/overview'), refetchInterval: 120_000 });
  return (
    <Panel
      id="w-market"
      title="Market overview"
      className="lg:col-span-7"
      action={
        q.data?.marketState ? (
          <Badge tone={q.data.marketState.isOpen ? 'up' : 'neutral'}>{q.data.marketState.isOpen ? 'US market open' : 'US market closed'}</Badge>
        ) : null
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={2} label="Loading market overview" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.configured ? (
        <NotConfigured message="Market data is not configured" hint="An administrator needs to set TWELVE_DATA_API_KEY on the API service. No prices are shown until then." />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {q.data!.proxies.map((p) => (
              <div key={p.symbol} className="min-w-0">
                <dt className="truncate text-sm text-ink-3">
                  <Link href={`/app/markets/${p.symbol}`} className="hover:text-ink hover:underline">
                    {p.label}
                  </Link>
                </dt>
                {p.quote ? (
                  <dd className="mt-1 flex items-baseline gap-3">
                    <span className="num text-xl font-medium">{money(p.quote.price, p.quote.currency ?? 'USD')}</span>
                    <Delta value={p.quote.changePct} className="text-sm" />
                  </dd>
                ) : (
                  <dd className="mt-1 text-sm text-ink-3">{p.error ?? 'Unavailable'}</dd>
                )}
              </div>
            ))}
          </dl>
          {(() => {
            const rows = q.data!.proxies
              .filter((p) => p.quote && typeof p.quote.low === 'number' && typeof p.quote.high === 'number' && typeof p.quote.price === 'number' && p.quote.high > p.quote.low)
              .map((p) => ({ symbol: p.symbol, label: `${p.label} day range`, low: p.quote!.low!, high: p.quote!.high!, price: p.quote!.price!, previousClose: p.quote!.previousClose, currency: p.quote!.currency }));
            return rows.length ? (
              <div className="mt-5 border-t border-line pt-4">
                <DayRange rows={rows} />
                <p className="mt-3 text-caption text-ink-3">Bar: today’s low to high. Dot: latest price. Tick: previous close.</p>
              </div>
            ) : null;
          })()}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            {q.data!.proxies[0]?.quote && <FreshnessBadge freshness={q.data!.proxies[0].quote.freshness} asOf={q.data!.proxies[0].quote.asOf} provider={q.data!.proxies[0].quote.provider} />}
            <p className="text-caption text-ink-3">{q.data!.note}</p>
          </div>
        </>
      )}
    </Panel>
  );
}

function WatchlistsWidget() {
  const q = useQuery({ queryKey: ['watchlists'], queryFn: () => api.get<{ items: Watchlist[] }>('/watchlists') });
  return (
    <Panel id="w-watchlists" title="Watchlists" className="lg:col-span-4" action={<Link href="/app/watchlists" className="text-sm text-info hover:underline">Manage</Link>}>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState title="No watchlists yet" action={<Link href="/app/watchlists" className="text-sm text-info hover:underline">Create a watchlist</Link>}>
          Track the companies you follow and get alerts when they move.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/60">
          {q.data!.items.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/app/watchlists/${w.id}`} className="min-w-0 truncate text-base text-ink hover:underline">
                {w.name}
              </Link>
              <span className="num shrink-0 text-sm text-ink-3">{w.items.length} {w.items.length === 1 ? 'symbol' : 'symbols'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HeadlinesWidget() {
  const q = useQuery({ queryKey: ['markets', 'news'], queryFn: () => api.get<{ items: NewsItem[]; provider: string }>('/markets/news') });
  return (
    <Panel id="w-headlines" title="Headlines" className="lg:col-span-8">
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState title="No headlines from the provider right now" />
      ) : (
        <>
          <ul className="divide-y divide-line/60">
            {q.data!.items.slice(0, 7).map((n) => (
              <li key={n.id} className="py-2.5">
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="text-base text-ink hover:text-info hover:underline">
                  {n.headline}
                </a>
                <p className="mt-0.5 text-caption text-ink-3">
                  {n.source}, {relative(n.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-ink-3">Headlines via {q.data!.provider}. Links open the publisher’s site.</p>
        </>
      )}
    </Panel>
  );
}

function ResearchWidget() {
  const q = useQuery({ queryKey: ['reports', 'recent'], queryFn: () => api.get<Paged<Report>>('/reports?pageSize=5') });
  return (
    <Panel id="w-research" title="Recent research" className="lg:col-span-6" action={<Link href="/app/analyst" className="text-sm text-info hover:underline">Ask the analyst</Link>}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState title="No research yet" action={<Link href="/app/analyst" className="text-sm text-info hover:underline">Start a research question</Link>}>
          Ask about a company and get a cited note you can check line by line.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/60">
          {q.data!.items.map((r) => (
            <li key={r.id} className="py-2.5">
              <Link href={`/app/reports/${r.id}`} className="line-clamp-1 text-base text-ink hover:underline">
                {r.title}
              </Link>
              <p className="mt-0.5 text-caption text-ink-3">
                {r.kind === 'daily_brief' ? 'Daily brief' : r.kind === 'weekly_digest' ? 'Weekly digest' : 'Research'}, {relative(r.generatedAt)}. {r.citationStats?.verified ?? 0} verified citations.
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AlertsWidget() {
  const q = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<{ items: Alert[] }>('/alerts') });
  const active = q.data?.items.filter((a) => a.active) ?? [];
  const label = (a: Alert) => (a.type === 'pct_move' ? `moves ±${a.threshold}%` : a.type === 'price_above' ? `at or above ${a.threshold}` : `at or below ${a.threshold}`);
  return (
    <Panel id="w-alerts" title="Active alerts" className="lg:col-span-6" action={<Link href="/app/alerts" className="text-sm text-info hover:underline">All alerts</Link>}>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !active.length ? (
        <EmptyState title="No active alerts" action={<Link href="/app/alerts" className="text-sm text-info hover:underline">Create an alert</Link>}>
          Set a price level or a daily move size and AlphaPulse checks it on schedule.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/60">
          {active.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-base">
                <span className="font-medium">{a.symbol}</span> <span className="text-ink-2">{label(a)}</span>
              </span>
              <span className="text-caption text-ink-3">{a.lastTriggeredAt ? `Triggered ${relative(a.lastTriggeredAt)}` : a.lastEvaluatedAt ? `Checked ${relative(a.lastEvaluatedAt)}` : 'Not checked yet'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WorkflowsWidget() {
  const q = useQuery({ queryKey: ['automations'], queryFn: () => api.get<{ items: WorkflowDef[]; runtime: { scheduler: string; n8nWebhook: string } }>('/automations') });
  return (
    <Panel id="w-workflows" title="Automations" className="lg:col-span-6" action={<Link href="/app/automations" className="text-sm text-info hover:underline">Open</Link>}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="divide-y divide-line/60">
          {q.data!.items.map((w) => (
            <li key={w.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-base text-ink">{w.name}</p>
                <p className="text-caption text-ink-3">
                  {w.enabled ? (w.trigger === 'manual' ? 'Enabled, run manually' : `Scheduled via ${w.trigger === 'n8n' ? 'n8n' : 'built-in scheduler'}`) : 'Disabled'}
                  {w.lastExecution ? `. Last run ${relative(w.lastExecution.startedAt)}.` : '. Never run.'}
                </p>
              </div>
              {w.lastExecution ? <StatusDot status={w.lastExecution.status} /> : <StatusDot status="never_checked" />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HealthWidget() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ status: string; database: { state: string; pingMs: number | null }; integrations: Record<string, string> }>('/health') });
  const providers = useQuery({ queryKey: ['automations', 'health'], queryFn: () => api.get<{ checks: { provider: string; status: string; checkedAt?: string; detail?: string }[] }>('/automations/health') });
  const LABELS: Record<string, string> = { marketData: 'Market data (Twelve Data)', newsAndFundamentals: 'News and fundamentals (Finnhub)', secFilings: 'SEC filings (EDGAR)', llm: 'AI analyst', email: 'Email delivery (Resend)', n8n: 'n8n workflows' };
  return (
    <Panel id="w-health" title="Data and pipeline health" className="lg:col-span-6">
      {health.isLoading ? (
        <SkeletonRows rows={5} />
      ) : health.isError ? (
        <ErrorState error={health.error} onRetry={() => health.refetch()} />
      ) : (
        <>
          <ul className="divide-y divide-line/60 text-sm">
            <li className="flex justify-between gap-3 py-2">
              <span className="text-ink-2">Database</span>
              <StatusDot status={health.data!.database.state === 'connected' ? 'ok' : 'down'} />
            </li>
            {Object.entries(LABELS).map(([k, label]) => (
              <li key={k} className="flex justify-between gap-3 py-2">
                <span className="text-ink-2">{label}</span>
                <StatusDot status={health.data!.integrations[k] === 'configured' ? 'ok' : 'not_configured'} />
              </li>
            ))}
          </ul>
          {providers.data && (
            <p className="mt-3 text-caption text-ink-3">
              Last provider check:{' '}
              {providers.data.checks.some((c) => c.checkedAt)
                ? providers.data.checks.filter((c) => c.checkedAt).map((c) => `${c.provider} ${c.status.replace('_', ' ')} ${relative(c.checkedAt)}`).join('; ')
                : 'not run yet. Run the data source health monitor from Automations.'}
            </p>
          )}
          <p className="mt-1 text-caption text-ink-3">“Operational” here means the integration is configured. Live probe results come from the health monitor.</p>
        </>
      )}
    </Panel>
  );
}


// ───────────────────────── Chart widgets (real data only) ─────────────────────────

interface Execution {
  id: string;
  workflowKey: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
}

function useWatchlistSymbols() {
  const q = useQuery({ queryKey: ['watchlists'], queryFn: () => api.get<{ items: Watchlist[] }>('/watchlists') });
  const symbols = useMemo(() => [...new Set((q.data?.items ?? []).flatMap((w) => w.items.map((i) => i.symbol)))], [q.data]);
  return { ...q, symbols };
}

function PulseWidget() {
  const wl = useWatchlistSymbols();
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<{ items: Alert[] }>('/alerts') });
  const reports = useQuery({ queryKey: ['reports', 'stats'], queryFn: () => api.get<Paged<Report>>('/reports?pageSize=50') });
  const runs = useQuery({ queryKey: ['executions', 'recent'], queryFn: () => api.get<Paged<Execution>>('/automations/executions?pageSize=100') });
  const active = alerts.data?.items.filter((a) => a.active) ?? [];
  const weekAgo = Date.now() - 7 * 86_400_000;
  const triggered = active.filter((a) => a.lastTriggeredAt && Date.parse(a.lastTriggeredAt) > weekAgo).length;
  const stats = (reports.data?.items ?? []).reduce((s, r) => ({ verified: s.verified + (r.citationStats?.verified ?? 0), sourced: s.sourced + (r.citationStats?.verified ?? 0) + (r.citationStats?.downgraded ?? 0) }), { verified: 0, sourced: 0 });
  const finished = (runs.data?.items ?? []).filter((x) => x.status !== 'running');
  const ok = finished.filter((x) => x.status === 'succeeded').length;
  const rate = finished.length ? ok / finished.length : null;
  return (
    <div id="w-pulse" className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-12 xl:grid-cols-4">
      <StatTile label="Symbols tracked" value={wl.data ? wl.symbols.length : null} sub={wl.data ? `across ${wl.data.items.length} ${wl.data.items.length === 1 ? 'watchlist' : 'watchlists'}` : 'Loading…'} />
      <StatTile label="Active alerts" value={alerts.data ? active.length : null} sub={alerts.data ? `${triggered} triggered in the last 7 days` : 'Loading…'} tone={triggered ? 'warn' : 'signal'} />
      <StatTile
        label="Research reports"
        value={reports.data ? reports.data.total : null}
        gauge={stats.sourced ? stats.verified / stats.sourced : null}
        sub={stats.sourced ? `${pct(stats.verified / stats.sourced, 0, false)} of sourced claims verified` : reports.data ? 'No sourced claims yet' : 'Loading…'}
      />
      <StatTile
        label="Automation success"
        value={rate === null ? null : rate * 100}
        format={(v) => `${v.toFixed(0)}%`}
        gauge={rate}
        tone={rate === null || rate >= 0.9 ? 'up' : rate >= 0.6 ? 'warn' : 'down'}
        sub={runs.data ? (finished.length ? `${ok} of ${finished.length} recent runs succeeded` : 'No runs yet') : 'Loading…'}
      />
    </div>
  );
}

function MoversWidget() {
  const overview = useQuery({ queryKey: ['markets', 'overview'], queryFn: () => api.get<Overview>('/markets/overview'), refetchInterval: 120_000 });
  const wl = useWatchlistSymbols();
  const extra = wl.symbols.filter((s) => !overview.data?.proxies.some((p) => p.symbol === s)).slice(0, 15);
  const quotes = useQuery({ queryKey: ['markets', 'quotes', extra.join(',')], queryFn: () => api.get<{ items: { symbol: string; quote: Quote | null; error: string | null }[] }>(`/markets/quotes?symbols=${extra.join(',')}`), enabled: extra.length > 0, refetchInterval: 120_000 });
  const rows: MoverRow[] = [
    ...(overview.data?.proxies ?? []).filter((p) => typeof p.quote?.changePct === 'number').map((p) => ({ symbol: p.symbol, label: p.label, changePct: p.quote!.changePct!, price: p.quote!.price, currency: p.quote!.currency })),
    ...(quotes.data?.items ?? []).filter((q) => typeof q.quote?.changePct === 'number').map((q) => ({ symbol: q.symbol, changePct: q.quote!.changePct!, price: q.quote!.price, currency: q.quote!.currency })),
  ];
  const failed = (quotes.data?.items ?? []).filter((q) => !q.quote).map((q) => q.symbol);
  return (
    <Panel id="w-movers" title="Today’s moves" className="lg:col-span-5" action={<span className="text-caption text-ink-3">Index ETFs + your watchlists</span>}>
      {overview.isLoading || (extra.length > 0 && quotes.isLoading) ? (
        <SkeletonRows rows={5} label="Loading quotes" />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No quotes available right now">Daily moves appear here once the market data provider returns prices.</EmptyState>
      ) : (
        <>
          <MoversChart rows={rows} caption="Percent change today, by symbol" />
          {failed.length > 0 && <p className="mt-2 text-caption text-ink-3">No quote for {failed.join(', ')}. Check the ticker symbol.</p>}
          <p className="mt-1 text-caption text-ink-3">Change vs previous close. Quotes are delayed.</p>
        </>
      )}
    </Panel>
  );
}

const RANGES = ['1M', '3M', '6M', '1Y'] as const;

function PerformanceWidget() {
  const [symbol, setSymbol] = useState('SPY');
  const [range, setRange] = useState<(typeof RANGES)[number]>('3M');
  const wl = useWatchlistSymbols();
  const options = [...new Set(['SPY', 'QQQ', 'DIA', 'IWM', ...wl.symbols])];
  const q = useQuery({
    queryKey: ['history', symbol, range],
    queryFn: () => api.get<{ bars: { date: string; close: number }[]; currency: string | null; provider: string; summary: { periodReturn: number | null; annualizedVolatility: number | null; maxDrawdown: number | null } | null }>(`/markets/${symbol}/history?range=${range}`),
    retry: false,
  });
  return (
    <Panel
      id="w-performance"
      title="Price performance"
      className="lg:col-span-7"
      action={
        <div className="flex items-center gap-2">
          <label htmlFor="perf-sym" className="sr-only">
            Symbol
          </label>
          <select id="perf-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="h-8 rounded-md border border-line bg-surface-2 px-2 text-sm text-ink">
            {options.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div role="group" aria-label="Range" className="flex rounded-md border border-line p-0.5">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cx('rounded px-2 py-1 text-caption', range === r ? 'bg-signal/15 text-signal' : 'text-ink-3 hover:text-ink')}>
                {r}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={5} label="Loading price history" />
      ) : q.isError ? (
        <ErrorState title="Price history unavailable" error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-caption text-ink-3">Return ({range})</dt>
              <dd className="mt-0.5">
                <Delta value={q.data!.summary?.periodReturn ?? null} />
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-3">Volatility (ann.)</dt>
              <dd className="num mt-0.5 text-ink">{pct(q.data!.summary?.annualizedVolatility ?? null, 1, false)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-3">Max drawdown</dt>
              <dd className="num mt-0.5 text-ink">{pct(q.data!.summary?.maxDrawdown ?? null, 1, false)}</dd>
            </div>
          </dl>
          <AnimatedArea key={`${symbol}-${range}`} points={q.data!.bars} currency={q.data!.currency} caption={`${symbol} daily closing price, ${range}`} />
          <p className="mt-2 text-caption text-ink-3">Daily closes via {q.data!.provider}. Hover for values.</p>
        </>
      )}
    </Panel>
  );
}

function EvidenceWidget() {
  const q = useQuery({ queryKey: ['reports', 'stats'], queryFn: () => api.get<Paged<Report>>('/reports?pageSize=50') });
  const t = (q.data?.items ?? []).reduce(
    (s, r) => ({ total: s.total + (r.citationStats?.total ?? 0), verified: s.verified + (r.citationStats?.verified ?? 0), downgraded: s.downgraded + (r.citationStats?.downgraded ?? 0) }),
    { total: 0, verified: 0, downgraded: 0 },
  );
  const other = Math.max(0, t.total - t.verified - t.downgraded);
  return (
    <Panel id="w-evidence" title="Research evidence quality" className="lg:col-span-5" action={<Link href="/app/reports" className="text-sm text-info hover:underline">Reports</Link>}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !t.total ? (
        <EmptyState title="No claims to measure yet" action={<Link href="/app/analyst" className="text-sm text-info hover:underline">Run your first research</Link>}>
          Once you run research, this shows how many claims were checked against their sources.
        </EmptyState>
      ) : (
        <>
          <Ring
            caption="Claims across your recent reports, by verification outcome"
            center={pct(t.verified / Math.max(1, t.verified + t.downgraded), 0, false)}
            centerSub="of sourced claims verified"
            segments={[
              { label: 'Verified against source', value: t.verified, color: VIZ.up, detail: 'Quoted passage found in the stored source' },
              { label: 'Downgraded to unverified', value: t.downgraded, color: VIZ.down, detail: 'Cited passage not found' },
              { label: 'Data, calculations, interpretation', value: other, color: VIZ.series[2]!, detail: 'No source citation required' },
            ]}
          />
          <p className="mt-3 text-caption text-ink-3">
            {t.total} claims across {q.data!.items.length} recent {q.data!.items.length === 1 ? 'report' : 'reports'}.
          </p>
        </>
      )}
    </Panel>
  );
}

function AllocationWidget() {
  const list = useQuery({ queryKey: ['portfolios'], queryFn: () => api.get<{ items: { id: string; name: string; positions: unknown[] }[] }>('/portfolios') });
  const first = list.data?.items.find((p) => p.positions.length) ?? null;
  const a = useQuery({
    queryKey: ['portfolio', first?.id, 'analytics', '3M'],
    queryFn: () => api.get<{ valuation: { positions: { symbol: string; value: number | null; weight: number | null; currency: string }[]; totals: { currency: string; value: number }[]; unvalued: string[] } }>(`/portfolios/${first!.id}/analytics?range=3M`),
    enabled: !!first,
  });
  const valued = (a.data?.valuation.positions ?? []).filter((p) => p.value && p.value > 0).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
  const top = valued.slice(0, 5);
  const rest = valued.slice(5).reduce((s, p) => s + (p.value ?? 0), 0);
  const total = a.data?.valuation.totals[0];
  return (
    <Panel id="w-allocation" title={first ? `Allocation: ${first.name}` : 'Portfolio allocation'} className="lg:col-span-6" action={<Link href="/app/portfolio" className="text-sm text-info hover:underline">Portfolio Lab</Link>}>
      {list.isLoading || (first && a.isLoading) ? (
        <SkeletonRows rows={4} />
      ) : list.isError || a.isError ? (
        <ErrorState error={list.error ?? a.error} onRetry={() => (list.isError ? list.refetch() : a.refetch())} />
      ) : !first ? (
        <EmptyState title="No hypothetical portfolio yet" action={<Link href="/app/portfolio" className="text-sm text-info hover:underline">Build one in Portfolio Lab</Link>}>
          Add positions to see how the value is split across holdings.
        </EmptyState>
      ) : !valued.length ? (
        <EmptyState title="Positions could not be priced">No quotes were available for {a.data?.valuation.unvalued.join(', ') || 'these positions'}, so nothing is valued.</EmptyState>
      ) : (
        <>
          <Ring
            caption="Share of portfolio value by position"
            center={total ? (total.currency === 'USD' ? `$${compact(total.value)}` : compact(total.value, total.currency)) : '—'}
            centerSub="current value"
            segments={[...top.map((p, i) => ({ label: p.symbol, value: p.value!, color: VIZ.series[i]! })), ...(rest > 0 ? [{ label: 'Other', value: rest, color: VIZ.neutral }] : [])]}
          />
          {!!a.data?.valuation.unvalued.length && <p className="mt-3 text-caption text-ink-3">Not valued (no quote): {a.data.valuation.unvalued.join(', ')}.</p>}
          <p className="mt-1 text-caption text-ink-3">Hypothetical positions at delayed prices.</p>
        </>
      )}
    </Panel>
  );
}

function ActivityWidget() {
  const q = useQuery({ queryKey: ['executions', 'recent'], queryFn: () => api.get<Paged<Execution>>('/automations/executions?pageSize=100') });
  const days = useMemo(() => {
    const out: ActivityDay[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      out.push({ date: d.toISOString().slice(0, 10), succeeded: 0, failed: 0, skipped: 0 });
    }
    for (const x of q.data?.items ?? []) {
      const d = new Date(x.startedAt);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      const row = out.find((r) => r.date === key);
      if (row && x.status !== 'running') row[x.status]++;
    }
    return out;
  }, [q.data]);
  const any = days.some((d) => d.succeeded + d.failed + d.skipped > 0);
  return (
    <Panel id="w-activity" title="Automation activity" className="lg:col-span-6" action={<span className="text-caption text-ink-3">Last 14 days</span>}>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !any ? (
        <EmptyState title="No workflow runs in the last 14 days" action={<Link href="/app/automations" className="text-sm text-info hover:underline">Run a workflow</Link>}>
          Daily briefs, watchlist checks and health monitors show up here as they run.
        </EmptyState>
      ) : (
        <ActivityBars days={days} caption="Workflow runs per day by outcome, last 14 days" />
      )}
    </Panel>
  );
}

const RENDER: Record<string, () => React.ReactElement> = {
  pulse: PulseWidget,
  movers: MoversWidget,
  performance: PerformanceWidget,
  evidence: EvidenceWidget,
  allocation: AllocationWidget,
  activity: ActivityWidget,
  market: MarketWidget,
  watchlists: WatchlistsWidget,
  headlines: HeadlinesWidget,
  research: ResearchWidget,
  alerts: AlertsWidget,
  workflows: WorkflowsWidget,
  health: HealthWidget,
};

export default function OverviewPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const saved = me.data?.dashboardWidgets;
  const enabled = !saved ? WIDGETS.map((w) => w.key as string) : saved.some((k) => CHART_KEYS.includes(k)) ? saved : [...saved, ...CHART_KEYS];
  const [draft, setDraft] = useState<string[]>(enabled);
  const save = useApiMutation((widgets: string[]) => api.patch('/me/settings', { dashboardWidgets: widgets }), {
    success: 'Dashboard updated',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setOpen(false);
    },
  });
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greet}, ${me.data?.name.split(' ')[0] ?? ''}`}
        description="What moved, what you follow, and what your automations did."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDraft(enabled);
              setOpen(true);
            }}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden /> Customize
          </Button>
        }
      />
      {enabled.length === 0 ? (
        <EmptyState title="Your dashboard is empty" action={<Button size="sm" onClick={() => setOpen(true)}>Choose widgets</Button>}>
          Pick the panels you want on this page.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {WIDGETS.filter((w) => enabled.includes(w.key)).map((w) => {
            const C = RENDER[w.key]!;
            return <C key={w.key} />;
          })}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Customize dashboard"
        description="Choose which panels appear on Overview."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(WIDGETS.map((w) => w.key).filter((k) => draft.includes(k)))}>
              Save dashboard
            </Button>
          </>
        }
      >
        <div className="flex flex-col">
          {WIDGETS.map((w) => (
            <Checkbox key={w.key} id={`wd-${w.key}`} label={w.label} checked={draft.includes(w.key)} onChange={(v) => setDraft(v ? [...draft, w.key] : draft.filter((x) => x !== w.key))} />
          ))}
        </div>
      </Dialog>
    </>
  );
}
