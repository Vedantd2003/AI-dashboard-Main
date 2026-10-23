'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeSymbol } from '@alphapulse/shared';
import { api } from '@/lib/api';
import { dateShort, money, num, pct } from '@/lib/format';
import { useApiMutation } from '@/lib/hooks';
import { CorrelationTable, Donut, TimeSeriesChart } from '@/components/charts';
import { Badge, DataTable, Delta, Stat } from '@/components/ui/data';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState, NotConfigured } from '@/components/ui/states';

interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  currency: string;
  purchaseDate?: string | null;
}
interface Portfolio {
  id: string;
  name: string;
  benchmark: string;
  baseCurrency: string;
  positions: Position[];
}
interface Valued extends Position {
  lastPrice: number | null;
  value: number | null;
  costBasis: number;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  weight: number | null;
  status: 'valued' | 'no_price';
}
interface Totals {
  currency: string;
  value: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number | null;
  hhi: number | null;
  topWeight: number | null;
  valuedPositions: number;
}
interface Analytics {
  marketDataConfigured: boolean;
  message?: string;
  valuation: { positions: Valued[]; totals: Totals[]; unvalued: string[] };
  priceMeta?: Record<string, { asOf?: string; freshness?: string; provider?: string; error?: string }>;
  currencyMismatches?: string[];
  history: null | {
    series: { date: string; close: number }[];
    drawdown: { date: string; value: number }[];
    maxDrawdown: { maxDrawdown: number; peakDate: string | null; troughDate: string | null; recoveryDate: string | null } | null;
    benchmark: { symbol: string; assetReturn: number | null; benchmarkReturn: number | null; excessReturn: number | null; start: string | null; end: string | null };
    correlation: { symbols: string[]; matrix: (number | null)[][]; observations: number; start: string | null; end: string | null } | null;
  };
  historyErrors?: Record<string, string>;
  assumptions?: string[];
  range?: string;
}

function PositionsEditor({ portfolio, onClose }: { portfolio: Portfolio; onClose: () => void }) {
  const [rows, setRows] = useState<Position[]>(portfolio.positions.map((p) => ({ ...p })));
  const [benchmark, setBenchmark] = useState(portfolio.benchmark);
  const save = useApiMutation(() => api.patch(`/portfolios/${portfolio.id}`, { positions: rows.map((r) => ({ ...r, symbol: r.symbol.toUpperCase(), purchaseDate: r.purchaseDate || undefined })), benchmark: benchmark.toUpperCase() }), {
    success: 'Positions saved',
    invalidate: [['portfolios'], ['portfolio-analytics', portfolio.id]],
    onSuccess: onClose,
  });
  const set = (i: number, patch: Partial<Position>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => !normalizeSymbol(r.symbol) || !(r.quantity > 0) || !(r.averageCost >= 0) || !/^[A-Z]{3}$/i.test(r.currency)) || !normalizeSymbol(benchmark);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Positions in ${portfolio.name}`}
      description="Hypothetical holdings for learning. These are not connected to any brokerage account."
      footer={
        <Button variant="primary" disabled={invalid} disabledReason="Every row needs a valid symbol, a quantity above zero, a cost and a 3-letter currency" loading={save.isPending} onClick={() => save.mutate()}>
          Save positions
        </Button>
      }
    >
      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <div className="mb-4 w-40">
          <Field label="Benchmark" htmlFor="pf-bm" hint="An ETF to compare against.">
            <Input id="pf-bm" value={benchmark} onChange={(e) => setBenchmark(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <fieldset key={i} className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_80px_auto]">
              <legend className="sr-only">Position {i + 1}</legend>
              <Field label="Symbol" htmlFor={`p-s-${i}`}>
                <Input id={`p-s-${i}`} value={r.symbol} onChange={(e) => set(i, { symbol: e.target.value })} />
              </Field>
              <Field label="Quantity" htmlFor={`p-q-${i}`}>
                <Input id={`p-q-${i}`} inputMode="decimal" value={Number.isFinite(r.quantity) ? r.quantity : ''} onChange={(e) => set(i, { quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Avg. cost" htmlFor={`p-c-${i}`}>
                <Input id={`p-c-${i}`} inputMode="decimal" value={Number.isFinite(r.averageCost) ? r.averageCost : ''} onChange={(e) => set(i, { averageCost: Number(e.target.value) })} />
              </Field>
              <Field label="Currency" htmlFor={`p-cur-${i}`}>
                <Input id={`p-cur-${i}`} maxLength={3} value={r.currency} onChange={(e) => set(i, { currency: e.target.value.toUpperCase() })} />
              </Field>
              <div className="flex items-end">
                <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="h-10 rounded p-2 text-ink-3 hover:bg-surface-3 hover:text-down" aria-label={`Remove position ${i + 1}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </fieldset>
          ))}
        </div>
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => setRows([...rows, { symbol: '', quantity: 1, averageCost: 0, currency: 'USD' }])} disabled={rows.length >= 200}>
          <Plus className="size-3.5" aria-hidden /> Add position
        </Button>
      </div>
    </Dialog>
  );
}

function Concentration({ t }: { t: Totals }) {
  const bars = [
    { label: 'Largest position', value: t.topWeight, threshold: 0.25, note: 'Above 25% is commonly considered concentrated.' },
    { label: 'Concentration index (HHI)', value: t.hhi, threshold: 0.25, note: 'Sum of squared weights. 1 = a single holding.' },
  ];
  return (
    <div className="flex flex-col gap-4">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-2">{b.label}</span>
            <span className="num text-ink">{b.value === null ? '—' : b.label.startsWith('Largest') ? pct(b.value, 1, false) : num(b.value, 3)}</span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-3" role="meter" aria-label={b.label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={b.value ?? 0}>
            <div className={`h-full rounded-full ${b.value !== null && b.value > b.threshold ? 'bg-warn' : 'bg-signal'}`} style={{ width: `${Math.min(100, (b.value ?? 0) * 100)}%` }} />
            <span aria-hidden className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${b.threshold * 100}%` }} />
          </div>
          <p className="mt-1 text-caption text-ink-3">{b.note}</p>
        </div>
      ))}
    </div>
  );
}

function AnalyticsView({ portfolio }: { portfolio: Portfolio }) {
  const [range, setRange] = useState<'3M' | '6M' | '1Y'>('1Y');
  const q = useQuery({ queryKey: ['portfolio-analytics', portfolio.id, range], queryFn: () => api.get<Analytics>(`/portfolios/${portfolio.id}/analytics?range=${range}`), enabled: portfolio.positions.length > 0 });
  const histSeries = useMemo(() => {
    const h = q.data?.history;
    if (!h?.series.length) return [];
    const base = h.series[0]!.close;
    return [{ name: 'Hypothetical portfolio', points: h.series.map((p) => ({ date: p.date, value: p.close / base - 1 })) }];
  }, [q.data]);

  if (!portfolio.positions.length) return <EmptyState title="No positions yet">Add a few hypothetical holdings to see valuation, allocation and risk.</EmptyState>;
  if (q.isLoading) return <SkeletonRows rows={8} label="Valuing positions" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data!;
  return (
    <div className="flex flex-col gap-4">
      {!a.marketDataConfigured && <NotConfigured message={a.message ?? 'Market data is not configured.'} hint="Cost basis is shown; positions can’t be valued without prices." />}
      {a.valuation.totals.map((t) => (
        <dl key={t.currency} className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 md:grid-cols-4">
          <Stat label={`Market value (${t.currency})`} value={money(t.value, t.currency)} sub={`${t.valuedPositions} valued positions`} />
          <Stat label="Cost basis" value={money(t.costBasis, t.currency)} sub="Of valued positions" />
          <Stat label="Unrealized P&L" value={<span className={t.unrealizedPnL >= 0 ? 'text-up' : 'text-down'}>{money(t.unrealizedPnL, t.currency)}</span>} sub={<Delta value={t.unrealizedPnLPct} />} />
          <Stat label="Benchmark" value={portfolio.benchmark} sub="Used for comparison below" />
        </dl>
      ))}
      {(a.valuation.unvalued.length > 0 || (a.currencyMismatches?.length ?? 0) > 0) && (
        <div className="rounded-[var(--radius-panel)] border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink-2">
          <p className="font-medium text-ink">Some positions can’t be valued right now</p>
          {a.valuation.unvalued.length > 0 && <p className="mt-1">No usable price for {a.valuation.unvalued.join(', ')}. They are excluded from totals rather than priced at a guess.</p>}
          {a.currencyMismatches?.map((m) => (
            <p key={m} className="mt-1">
              Currency mismatch, {m}. No FX conversion is applied.
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="Positions" className="lg:col-span-8">
          <DataTable caption="Hypothetical positions" head={[{ label: 'Symbol' }, { label: 'Quantity', align: 'right' }, { label: 'Avg. cost', align: 'right' }, { label: 'Last', align: 'right' }, { label: 'Value', align: 'right' }, { label: 'P&L', align: 'right' }, { label: 'Weight', align: 'right' }]}>
            {a.valuation.positions.map((p, i) => (
              <tr key={`${p.symbol}-${i}`}>
                <td className="font-medium">{p.symbol}</td>
                <td className="num text-right">{num(p.quantity, p.quantity % 1 ? 4 : 0)}</td>
                <td className="num text-right">{money(p.averageCost, p.currency)}</td>
                <td className="num text-right">{p.lastPrice === null ? <span className="text-ink-3">No price</span> : money(p.lastPrice, p.currency)}</td>
                <td className="num text-right">{money(p.value, p.currency)}</td>
                <td className="text-right">
                  {p.unrealizedPnL === null ? (
                    '—'
                  ) : (
                    <span className={`num ${p.unrealizedPnL >= 0 ? 'text-up' : 'text-down'}`}>
                      {money(p.unrealizedPnL, p.currency)} <span className="text-caption">({pct(p.unrealizedPnLPct, 1)})</span>
                    </span>
                  )}
                </td>
                <td className="num text-right">{pct(p.weight, 1, false)}</td>
              </tr>
            ))}
          </DataTable>
          {a.priceMeta && Object.values(a.priceMeta)[0]?.provider && <p className="mt-3 text-caption text-ink-3">Delayed prices via {Object.values(a.priceMeta)[0]!.provider}.</p>}
        </Panel>
        <Panel title="Allocation" className="lg:col-span-4">
          {a.valuation.totals.length === 1 && a.valuation.totals[0]!.value > 0 ? (
            <>
              <Donut
                slices={a.valuation.positions.filter((p) => p.value).map((p) => ({ label: p.symbol, value: p.value! }))}
                centerLabel="Value"
                centerValue={money(a.valuation.totals[0]!.value, a.valuation.totals[0]!.currency, 0)}
              />
              <div className="mt-5 border-t border-line pt-4">
                <Concentration t={a.valuation.totals[0]!} />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">{a.valuation.totals.length > 1 ? 'Allocation is shown per currency in the totals above; mixed currencies are not combined.' : 'Nothing valued yet.'}</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Historical performance"
        action={
          <div role="radiogroup" aria-label="Range" className="flex gap-0.5 rounded-[var(--radius-control)] border border-line p-0.5">
            {(['3M', '6M', '1Y'] as const).map((r) => (
              <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={`rounded-[3px] px-2 py-0.5 text-caption ${range === r ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink'}`}>
                {r}
              </button>
            ))}
          </div>
        }
      >
        {!a.history ? (
          <p className="text-sm text-ink-3">
            Historical analytics need price history for every position in a single currency.
            {a.historyErrors && Object.keys(a.historyErrors).length ? ` Missing history for ${Object.keys(a.historyErrors).join(', ')}.` : ''}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <TimeSeriesChart mode="lines" valueFormat="percent" series={histSeries} ariaLabel="Hypothetical portfolio cumulative return" height={260} />
            <div className="flex flex-col gap-5">
              <dl className="grid grid-cols-2 gap-4">
                <Stat label="Portfolio return" value={pct(a.history.benchmark.assetReturn)} />
                <Stat label={`${a.history.benchmark.symbol} return`} value={pct(a.history.benchmark.benchmarkReturn)} />
                <Stat label="Difference" value={<Delta value={a.history.benchmark.excessReturn} />} title="Portfolio return minus benchmark return (not risk-adjusted)" />
                <Stat label="Max drawdown" value={pct(a.history.maxDrawdown?.maxDrawdown, 1)} sub={a.history.maxDrawdown?.troughDate ? `Trough ${dateShort(a.history.maxDrawdown.troughDate)}` : undefined} />
              </dl>
              <p className="text-caption text-ink-3">
                {dateShort(a.history.benchmark.start)} to {dateShort(a.history.benchmark.end)}, daily closes on dates all positions traded.
              </p>
            </div>
          </div>
        )}
        {a.history?.correlation && (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-2 text-base font-medium">Correlation between holdings</h3>
            <CorrelationTable symbols={a.history.correlation.symbols} matrix={a.history.correlation.matrix} caption="Correlation of daily returns between holdings" />
            <p className="mt-2 text-caption text-ink-3">
              Pearson correlation of daily simple returns, {a.history.correlation.observations} observations.
            </p>
          </div>
        )}
      </Panel>

      {a.assumptions && (
        <section className="rounded-[var(--radius-panel)] border border-line px-4 py-3">
          <h2 className="text-sm font-medium text-ink">Assumptions</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
            {a.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function PortfolioLab() {
  const list = useQuery({ queryKey: ['portfolios'], queryFn: () => api.get<{ items: Portfolio[] }>('/portfolios') });
  const [selected, setSelected] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (!selected && list.data?.items[0]) setSelected(list.data.items[0].id);
  }, [list.data, selected]);
  const create = useApiMutation((n: string) => api.post<Portfolio>('/portfolios', { name: n }), {
    success: (p) => `Created ${p.name}`,
    invalidate: [['portfolios']],
    onSuccess: (p) => {
      setSelected(p.id);
      setCreating(false);
      setName('');
      setEditing(true);
    },
  });
  const del = useApiMutation((id: string) => api.del(`/portfolios/${id}`), { success: 'Portfolio deleted', invalidate: [['portfolios']], onSuccess: () => setSelected('') });
  const current = list.data?.items.find((p) => p.id === selected);

  return (
    <>
      <PageHeader
        title="Portfolio Lab"
        description="Model a hypothetical portfolio to study allocation, concentration and historical risk. Educational only: no brokerage connection, no trades, no tax calculations."
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden /> New portfolio
          </Button>
        }
      />
      {list.isLoading ? (
        <SkeletonRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data!.items.length ? (
        <EmptyState title="No hypothetical portfolios" action={<Button size="sm" variant="primary" onClick={() => setCreating(true)}>Create a portfolio</Button>}>
          Enter positions by hand to see how a mix of holdings would have behaved.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Portfolio" htmlFor="pf-sel" className="w-64">
              <Select id="pf-sel" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {list.data!.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            {current && (
              <>
                <Badge tone="gold">Hypothetical</Badge>
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Edit positions
                </Button>
                <ConfirmDialog
                  title={`Delete ${current.name}?`}
                  description="This removes the hypothetical portfolio and its positions."
                  confirmLabel="Delete portfolio"
                  onConfirm={() => del.mutateAsync(current.id)}
                  trigger={(open) => (
                    <Button size="sm" variant="ghost" onClick={open}>
                      Delete
                    </Button>
                  )}
                />
              </>
            )}
          </div>
          {current && <AnalyticsView key={current.id + current.positions.length} portfolio={current} />}
        </>
      )}
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New hypothetical portfolio"
        footer={
          <Button variant="primary" disabled={!name.trim()} disabledReason="Name the portfolio" loading={create.isPending} onClick={() => create.mutate(name.trim())}>
            Create portfolio
          </Button>
        }
      >
        <Field label="Name" htmlFor="pf-n">
          <Input id="pf-n" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dividend learning portfolio" />
        </Field>
      </Dialog>
      {editing && current && <PositionsEditor portfolio={current} onClose={() => setEditing(false)} />}
    </>
  );
}
