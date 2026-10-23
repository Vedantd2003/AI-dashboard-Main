'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { money, relative } from '@/lib/format';
import { useApiMutation, useMe } from '@/lib/hooks';
import type { Alert, NewsItem, Paged, Quote, Report, Watchlist, WorkflowDef } from '@/lib/types';
import { Badge, Delta, FreshnessBadge, StatusDot } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, PageHeader, Panel, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState, NotConfigured } from '@/components/ui/states';

const WIDGETS = [
  { key: 'market', label: 'Market overview' },
  { key: 'watchlists', label: 'Watchlists' },
  { key: 'headlines', label: 'Headlines' },
  { key: 'research', label: 'Recent research' },
  { key: 'alerts', label: 'Active alerts' },
  { key: 'workflows', label: 'Automations' },
  { key: 'health', label: 'Data and pipeline health' },
] as const;

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
      className="lg:col-span-12"
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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
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
  const LABELS: Record<string, string> = { marketData: 'Market data (Twelve Data)', newsAndFundamentals: 'News and fundamentals (Finnhub)', secFilings: 'SEC filings (EDGAR)', llm: 'AI analyst (OpenRouter)', email: 'Email delivery (Resend)', n8n: 'n8n workflows' };
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

const RENDER: Record<string, () => React.ReactElement> = {
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
  const enabled = me.data?.dashboardWidgets ?? WIDGETS.map((w) => w.key);
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
