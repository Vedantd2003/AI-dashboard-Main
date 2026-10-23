'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Plus, Siren } from 'lucide-react';
import { api } from '@/lib/api';
import { compact, dateShort, money, num, pct, relative } from '@/lib/format';
import { useApiMutation } from '@/lib/hooks';
import type { History, Metric, NewsItem, Profile, Quote, Settled, Watchlist } from '@/lib/types';
import { TimeSeriesChart } from '@/components/charts';
import { DataTable, Delta, FreshnessBadge, Stat } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState, NotConfigured } from '@/components/ui/states';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;

interface Filing {
  form: string;
  filingDate: string;
  description: string;
  url: string;
  accessionNumber: string;
}

function SubError({ e }: { e: { code: string; message: string } }) {
  return e.code === 'integration_not_configured' ? <NotConfigured message={e.message} compact /> : <p className="text-sm text-ink-3">{e.message}</p>;
}

function AddToWatchlist({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const lists = useQuery({ queryKey: ['watchlists'], queryFn: () => api.get<{ items: Watchlist[] }>('/watchlists'), enabled: open });
  const [id, setId] = useState('');
  const add = useApiMutation((wl: string) => api.post(`/watchlists/${wl}/items`, { symbol }), { success: `Added ${symbol} to watchlist`, invalidate: [['watchlists']], onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden /> Add to watchlist
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Add ${symbol} to a watchlist`}
        footer={
          <Button variant="primary" disabled={!id} disabledReason="Choose a watchlist" loading={add.isPending} onClick={() => add.mutate(id)}>
            Add to watchlist
          </Button>
        }
      >
        {lists.isLoading ? (
          <SkeletonRows rows={2} />
        ) : !lists.data?.items.length ? (
          <EmptyState title="You have no watchlists" action={<Link href="/app/watchlists" className="text-sm text-info hover:underline">Create a watchlist</Link>} />
        ) : (
          <Field label="Watchlist" htmlFor="atw">
            <Select id="atw" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choose…</option>
              {lists.data.items.map((w) => (
                <option key={w.id} value={w.id} disabled={w.items.some((i) => i.symbol === symbol)}>
                  {w.name}
                  {w.items.some((i) => i.symbol === symbol) ? ' (already added)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Dialog>
    </>
  );
}

function QuickAlert({ symbol, price }: { symbol: string; price: number | null }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'price_above' | 'price_below' | 'pct_move'>('price_above');
  const [threshold, setThreshold] = useState(price ? String(Math.round(price * 1.05 * 100) / 100) : '');
  const create = useApiMutation(() => api.post('/alerts', { symbol, type, threshold: Number(threshold) }), { success: 'Alert created', invalidate: [['alerts']], onSuccess: () => setOpen(false) });
  const valid = Number(threshold) > 0 && (type !== 'pct_move' || Number(threshold) <= 100);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Siren className="size-3.5" aria-hidden /> Create alert
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Alert for ${symbol}`}
        description="Checked by the watchlist monitor against delayed quotes. You’ll get at most one notification per day per alert."
        footer={
          <Button variant="primary" disabled={!valid} disabledReason="Enter a positive threshold" loading={create.isPending} onClick={() => create.mutate()}>
            Create alert
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="When" htmlFor="qa-type">
            <Select id="qa-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="price_above">Price rises to or above</option>
              <option value="price_below">Price falls to or below</option>
              <option value="pct_move">Daily move is at least (±%)</option>
            </Select>
          </Field>
          <Field label={type === 'pct_move' ? 'Percent' : 'Price'} htmlFor="qa-th">
            <Input id="qa-th" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function formatMetric(m: Metric, currency: string | null) {
  if (m.unit === 'percent') return `${num(m.value, 1)}%`;
  if (m.unit === 'currency') return money(m.value, currency ?? 'USD');
  return num(m.value, 2);
}

export default function SymbolPage() {
  const { symbol: raw } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(raw).toUpperCase();
  const [range, setRange] = useState<(typeof RANGES)[number]>('6M');

  const detail = useQuery({ queryKey: ['symbol', symbol], queryFn: () => api.get<{ quote: Settled<Quote>; profile: Settled<Profile>; metrics: Settled<{ metrics: Metric[]; provider: string; retrievedAt: string }> }>(`/markets/${encodeURIComponent(symbol)}`) });
  const hist = useQuery({ queryKey: ['history', symbol, range], queryFn: () => api.get<History>(`/markets/${encodeURIComponent(symbol)}/history?range=${range}`) });
  const news = useQuery({ queryKey: ['news', symbol], queryFn: () => api.get<{ items: NewsItem[]; provider: string }>(`/markets/${encodeURIComponent(symbol)}/news?days=14`) });
  const filings = useQuery({ queryKey: ['filings', symbol], queryFn: () => api.get<{ items: Filing[]; note?: string }>(`/markets/${encodeURIComponent(symbol)}/filings`) });

  const q = detail.data?.quote.data;
  const p = detail.data?.profile.data;
  const series = useMemo(() => (hist.data ? [{ name: symbol, points: hist.data.bars.map((b) => ({ date: b.date, value: b.close })) }] : []), [hist.data, symbol]);
  const s = hist.data?.summary;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">
            <Link href="/app/markets" className="hover:underline">
              Markets
            </Link>{' '}
            / {symbol}
          </p>
          <h1 className="mt-1 font-serif text-[2rem] leading-tight font-medium">{p?.name ?? q?.name ?? symbol}</h1>
          {detail.isLoading ? (
            <SkeletonRows rows={1} />
          ) : q ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="num text-3xl font-medium">{money(q.price, q.currency ?? 'USD')}</span>
              <Delta value={q.changePct} className="text-base" />
              <span className="num text-sm text-ink-3">{q.change !== null ? `${q.change > 0 ? '+' : ''}${num(q.change)} today` : ''}</span>
              <FreshnessBadge freshness={q.freshness} asOf={q.asOf} provider={q.provider} />
            </div>
          ) : detail.data?.quote.error ? (
            <div className="mt-2">
              <SubError e={detail.data.quote.error} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <AddToWatchlist symbol={symbol} />
          <QuickAlert symbol={symbol} price={q?.price ?? null} />
          <Link href={`/app/analyst?symbols=${encodeURIComponent(symbol)}`} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-ink bg-ink px-3 text-sm font-medium text-bg hover:bg-white">
            <Bot className="size-3.5" aria-hidden /> Research {symbol}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          id="chart"
          title="Price history"
          className="lg:col-span-8"
          action={
            <div role="radiogroup" aria-label="Time range" className="flex gap-0.5 rounded-[var(--radius-control)] border border-line p-0.5">
              {RANGES.map((r) => (
                <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={`rounded-[3px] px-2 py-0.5 text-caption ${range === r ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink'}`}>
                  {r}
                </button>
              ))}
            </div>
          }
        >
          {hist.isLoading ? (
            <SkeletonRows rows={8} label="Loading chart" />
          ) : hist.isError ? (
            <ErrorState error={hist.error} onRetry={() => hist.refetch()} />
          ) : !hist.data!.bars.length ? (
            <EmptyState title="No price history for this range" />
          ) : (
            <>
              <TimeSeriesChart series={series} ariaLabel={`${symbol} daily closing price, ${range}`} currency={hist.data!.currency} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <FreshnessBadge freshness={hist.data!.freshness} asOf={hist.data!.asOf} provider={hist.data!.provider} />
                <span className="text-caption text-ink-3">
                  Daily closes{hist.data!.currency ? ` in ${hist.data!.currency}` : ''}{hist.data!.exchangeTimezone ? `, exchange time zone ${hist.data!.exchangeTimezone}` : ''}.
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel id="stats" title="Calculated over this period" className="lg:col-span-4">
          {!s ? (
            <SkeletonRows rows={6} />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Stat label="Period return" value={pct(s.periodReturn)} />
                <Stat label="Annualized volatility" value={pct(s.annualizedVolatility, 1, false)} title="Sample std. dev. of daily log returns × √252. Needs ≥ 20 observations." />
                <Stat label="Max drawdown" value={pct(s.maxDrawdown, 1)} title="Largest peak-to-trough decline of daily closes" />
                <Stat label="RSI (14)" value={num(s.rsi14, 1)} title="Wilder’s Relative Strength Index on daily closes" />
                <Stat label="50-day average" value={num(s.sma50)} />
                <Stat label="200-day average" value={num(s.sma200)} sub={s.sma200 === null ? 'Needs 200 days; pick 1Y or 5Y' : undefined} />
              </dl>
              <p className="mt-4 border-t border-line pt-3 text-caption text-ink-3">
                {s.observations} daily observations, {dateShort(s.start)} to {dateShort(s.end)}. Indicators describe past prices and do not predict returns.
              </p>
            </>
          )}
        </Panel>

        <Panel id="profile" title="Company profile" className="lg:col-span-4">
          {detail.isLoading ? (
            <SkeletonRows rows={5} />
          ) : p ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Stat label="Industry" value={<span className="text-base">{p.industry ?? '—'}</span>} />
              <Stat label="Exchange" value={<span className="text-base">{p.exchange ?? '—'}</span>} />
              <Stat label="Market cap" value={compact(p.marketCap, p.currency)} />
              <Stat label="Country" value={<span className="text-base">{p.country ?? '—'}</span>} />
              <Stat label="Listed since" value={<span className="text-base">{p.ipo ? dateShort(p.ipo) : '—'}</span>} />
              <Stat
                label="Website"
                value={
                  p.website ? (
                    <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="text-base text-info hover:underline">
                      {p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
            </dl>
          ) : detail.data?.profile.error ? (
            <SubError e={detail.data.profile.error} />
          ) : null}
          {p && <p className="mt-4 text-caption text-ink-3">Profile via {p.provider}.</p>}
        </Panel>

        <Panel id="metrics" title="Reported metrics" className="lg:col-span-8">
          {detail.isLoading ? (
            <SkeletonRows rows={5} />
          ) : detail.data?.metrics.data ? (
            detail.data.metrics.data.metrics.length ? (
              <>
                <DataTable caption={`${symbol} financial metrics`} head={[{ label: 'Metric' }, { label: 'Period' }, { label: 'Value', align: 'right' }]}>
                  {detail.data.metrics.data.metrics.map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td className="text-ink-3">{m.period}</td>
                      <td className="num text-right">{formatMetric(m, p?.currency ?? null)}</td>
                    </tr>
                  ))}
                </DataTable>
                <p className="mt-3 text-caption text-ink-3">Via {detail.data.metrics.data.provider}, retrieved {relative(detail.data.metrics.data.retrievedAt)}. Definitions follow the provider.</p>
              </>
            ) : (
              <EmptyState title="The provider returned no metrics for this symbol" />
            )
          ) : detail.data?.metrics.error ? (
            <SubError e={detail.data.metrics.error} />
          ) : null}
        </Panel>

        <Panel id="news" title="Recent news" className="lg:col-span-7">
          {news.isLoading ? (
            <SkeletonRows rows={5} />
          ) : news.isError ? (
            <ErrorState error={news.error} onRetry={() => news.refetch()} />
          ) : !news.data!.items.length ? (
            <EmptyState title="No news in the last 14 days" />
          ) : (
            <ul className="divide-y divide-line/60">
              {news.data!.items.slice(0, 10).map((n) => (
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
          )}
        </Panel>

        <Panel id="filings" title="SEC filings" className="lg:col-span-5">
          {filings.isLoading ? (
            <SkeletonRows rows={5} />
          ) : filings.isError ? (
            <ErrorState error={filings.error} onRetry={() => filings.refetch()} />
          ) : !filings.data!.items.length ? (
            <EmptyState title="No recent filings">{filings.data!.note}</EmptyState>
          ) : (
            <ul className="divide-y divide-line/60">
              {filings.data!.items.map((f) => (
                <li key={f.accessionNumber} className="flex items-baseline justify-between gap-3 py-2.5">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-base text-ink hover:text-info hover:underline">
                    <span className="font-medium">{f.form}</span> <span className="text-ink-2">{f.description}</span>
                  </a>
                  <span className="num shrink-0 text-caption text-ink-3">{dateShort(f.filingDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
