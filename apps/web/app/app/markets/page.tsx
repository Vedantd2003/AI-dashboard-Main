'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateShort, num, pct } from '@/lib/format';
import type { Metric, SeriesSummary } from '@/lib/types';
import { CorrelationTable, TimeSeriesChart } from '@/components/charts';
import { DataTable } from '@/components/ui/data';
import { Button, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';

interface Match {
  symbol: string;
  name: string;
  exchange: string | null;
  country: string | null;
  type: string | null;
  currency: string | null;
}

function SearchPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const query = useQuery({ queryKey: ['search', initial], queryFn: () => api.get<{ results: Match[]; provider: string }>(`/markets/search?q=${encodeURIComponent(initial)}`), enabled: initial.length > 0 });
  return (
    <Panel id="search" title="Find a company">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/app/markets?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor="mk-q" className="sr-only">
          Company name or symbol
        </label>
        <Input id="mk-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apple, MSFT, BRK.B…" className="sm:max-w-md" />
        <Button type="submit" variant="primary" disabled={!q.trim()} disabledReason="Type a name or symbol first">
          Search
        </Button>
      </form>
      <div className="mt-4">
        {!initial ? (
          <p className="text-sm text-ink-3">Search by company name or ticker. Coverage depends on the configured market data plan; the free Twelve Data plan covers US listings.</p>
        ) : query.isLoading ? (
          <SkeletonRows rows={4} label="Searching" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.data!.results.length ? (
          <EmptyState title={`No matches for “${initial}”`}>Try the exact ticker, or a shorter part of the company name.</EmptyState>
        ) : (
          <DataTable caption="Search results" head={[{ label: 'Symbol' }, { label: 'Name' }, { label: 'Exchange' }, { label: 'Type' }, { label: 'Currency' }]}>
            {query.data!.results.map((r) => (
              <tr key={`${r.symbol}-${r.exchange}`}>
                <td>
                  <Link href={`/app/markets/${encodeURIComponent(r.symbol)}`} className="font-medium text-ink hover:text-info hover:underline">
                    {r.symbol}
                  </Link>
                </td>
                <td className="text-ink-2">{r.name}</td>
                <td className="text-ink-3">{r.exchange ?? '—'}</td>
                <td className="text-ink-3">{r.type ?? '—'}</td>
                <td className="text-ink-3">{r.currency ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </Panel>
  );
}

interface CompareResp {
  range: string;
  symbols: { symbol: string; summary: SeriesSummary | null; currency: string | null; history: { date: string; close: number }[]; historyError: { message: string } | null; metrics: Metric[]; metricsError: { message: string } | null }[];
  correlation: { symbols: string[]; matrix: (number | null)[][]; observations: number; start: string | null; end: string | null; method: string } | null;
}

function ComparePanel() {
  const [input, setInput] = useState('AAPL, MSFT');
  const [range, setRange] = useState('1Y');
  const [submitted, setSubmitted] = useState<{ symbols: string; range: string } | null>(null);
  const q = useQuery({
    queryKey: ['compare', submitted],
    queryFn: () => api.get<CompareResp>(`/markets/compare?symbols=${encodeURIComponent(submitted!.symbols)}&range=${submitted!.range}`),
    enabled: !!submitted,
  });
  const parsed = input.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);

  const normalized = useMemo(() => {
    if (!q.data) return [];
    return q.data.symbols
      .filter((s) => s.history.length > 1)
      .map((s) => ({ name: s.symbol, points: s.history.map((h) => ({ date: h.date, value: h.close / s.history[0]!.close - 1 })) }));
  }, [q.data]);

  const metricLabels = useMemo(() => [...new Set(q.data?.symbols.flatMap((s) => s.metrics.map((m) => `${m.label}|${m.period}`)) ?? [])], [q.data]);

  return (
    <Panel id="compare" title="Compare companies">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({ symbols: parsed.join(','), range });
        }}
      >
        <Field label="Symbols (2 to 5)" htmlFor="cmp-s">
          <Input id="cmp-s" value={input} onChange={(e) => setInput(e.target.value)} />
        </Field>
        <Field label="Period" htmlFor="cmp-r">
          <Select id="cmp-r" value={range} onChange={(e) => setRange(e.target.value)}>
            {['1M', '3M', '6M', 'YTD', '1Y', '5Y'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" disabled={parsed.length < 2 || parsed.length > 5} disabledReason="Enter between 2 and 5 symbols">
          Compare
        </Button>
      </form>

      <div className="mt-5">
        {!submitted ? (
          <p className="text-sm text-ink-3">Returns are rebased to the first common date. Correlation uses daily simple returns over dates all symbols traded.</p>
        ) : q.isLoading ? (
          <SkeletonRows rows={6} label="Comparing" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="flex flex-col gap-6">
            {normalized.length > 0 && <TimeSeriesChart mode="lines" valueFormat="percent" series={normalized} ariaLabel={`Cumulative return comparison, ${q.data!.range}`} height={280} />}
            <DataTable
              caption="Comparison of returns and risk"
              head={[{ label: 'Symbol' }, { label: 'Period return', align: 'right' }, { label: 'Annualized volatility', align: 'right' }, { label: 'Max drawdown', align: 'right' }, { label: 'RSI 14', align: 'right' }, { label: 'Period' }]}
            >
              {q.data!.symbols.map((s) => (
                <tr key={s.symbol}>
                  <td className="font-medium">{s.symbol}</td>
                  {s.summary ? (
                    <>
                      <td className="num text-right">{pct(s.summary.periodReturn)}</td>
                      <td className="num text-right">{pct(s.summary.annualizedVolatility, 1, false)}</td>
                      <td className="num text-right">{pct(s.summary.maxDrawdown, 1)}</td>
                      <td className="num text-right">{num(s.summary.rsi14, 1)}</td>
                      <td className="text-ink-3">
                        {dateShort(s.summary.start)} to {dateShort(s.summary.end)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="text-ink-3">
                      {s.historyError?.message ?? 'No history'}
                    </td>
                  )}
                </tr>
              ))}
            </DataTable>
            {metricLabels.length > 0 && (
              <div>
                <h3 className="mb-2 text-base font-medium">Reported metrics</h3>
                <DataTable caption="Fundamental metrics by company" head={[{ label: 'Metric' }, { label: 'Period' }, ...q.data!.symbols.map((s) => ({ label: s.symbol, align: 'right' as const }))]}>
                  {metricLabels.map((ml) => {
                    const [label, period] = ml.split('|');
                    return (
                      <tr key={ml}>
                        <td>{label}</td>
                        <td className="text-ink-3">{period}</td>
                        {q.data!.symbols.map((s) => {
                          const m = s.metrics.find((x) => x.label === label && x.period === period);
                          return (
                            <td key={s.symbol} className="num text-right">
                              {m ? (m.unit === 'percent' ? `${num(m.value, 1)}%` : num(m.value, 2)) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </DataTable>
                <p className="mt-2 text-caption text-ink-3">Metrics are compared only within the same reported period. Values come from Finnhub and may follow the provider’s own definitions.</p>
              </div>
            )}
            {q.data!.correlation && (
              <div>
                <h3 className="mb-2 text-base font-medium">Correlation of daily returns</h3>
                <CorrelationTable symbols={q.data!.correlation.symbols} matrix={q.data!.correlation.matrix} caption="Correlation matrix" />
                <p className="mt-2 text-caption text-ink-3">
                  {q.data!.correlation.method}. {q.data!.correlation.observations} observations from {dateShort(q.data!.correlation.start)} to {dateShort(q.data!.correlation.end)}. Past correlation does not predict future co-movement.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function MarketsPage() {
  return (
    <>
      <PageHeader title="Markets" description="Look up a company, read its data with the source and timestamp attached, and compare it with peers." />
      <div className="flex flex-col gap-4">
        <Suspense>
          <SearchPanel />
        </Suspense>
        <ComparePanel />
      </div>
    </>
  );
}
