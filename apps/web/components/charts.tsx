'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AreaSeries, ColorType, CrosshairMode, LineSeries, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { cx, money, num, pct } from '@/lib/format';

const C = { signal: '#3cc8c0', gold: '#c9a45c', info: '#6fa3d9', line: '#22304a', ink3: '#8a90a0', up: '#3fb68b', down: '#e06c6c' };
// Validated categorical palette for the dark surface (see components/dashboard-charts.tsx VIZ).
export const SERIES_COLORS = ['#1f9e96', '#d9702b', '#3987e5', '#c98500', '#d55181', '#9085e9'];

const toTime = (d: string) => (Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / 1000) as UTCTimestamp;

interface Series {
  name: string;
  points: { date: string; value: number }[];
  color?: string;
}

/**
 * Time-series chart. `mode="area"` for a single price series; `mode="lines"` for comparisons.
 * A visually hidden summary + table gives screen-reader users the same information.
 */
export function TimeSeriesChart({
  series,
  mode = 'area',
  height = 300,
  valueFormat = 'price',
  currency,
  ariaLabel,
}: {
  series: Series[];
  mode?: 'area' | 'lines';
  height?: number;
  valueFormat?: 'price' | 'percent';
  currency?: string | null;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.ink3, fontFamily: 'Inter Variable, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(34,48,74,0.6)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: C.ink3, labelBackgroundColor: '#1e2b45' }, horzLine: { color: C.ink3, labelBackgroundColor: '#1e2b45' } },
      localization: {
        priceFormatter: (v: number) => (valueFormat === 'percent' ? pct(v, 1) : num(v, 2)),
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    series.forEach((s, i) => {
      const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
      const data = s.points.map((p) => ({ time: toTime(p.date), value: p.value }));
      if (mode === 'area' && i === 0) {
        const a = chart.addSeries(AreaSeries, { lineColor: color, lineWidth: 2, topColor: 'rgba(60,200,192,0.18)', bottomColor: 'rgba(60,200,192,0)', priceLineVisible: false, lastValueVisible: true });
        a.setData(data);
      } else {
        const l = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: s.name });
        l.setData(data);
      }
    });
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [series, mode, height, valueFormat]);

  const summary = useMemo(() => {
    return series.map((s) => {
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      const fmt = (v: number) => (valueFormat === 'percent' ? pct(v) : currency ? money(v, currency) : num(v));
      return first && last ? `${s.name}: ${fmt(first.value)} on ${first.date} to ${fmt(last.value)} on ${last.date}, ${s.points.length} observations.` : `${s.name}: no data.`;
    });
  }, [series, valueFormat, currency]);

  return (
    <figure className="m-0">
      <div ref={el} role="img" aria-label={ariaLabel} style={{ height }} className="w-full" />
      <figcaption className="sr-only">{summary.join(' ')}</figcaption>
      {mode === 'lines' && series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-2 text-sm text-ink-2">
              <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function Sparkline({ values, className, label }: { values: number[]; className?: string; label: string }) {
  if (values.length < 2) return <span className={cx('text-caption text-ink-3', className)}>No history</span>;
  const w = 96;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={up ? C.up : C.down} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Allocation donut with an adjacent legend table (the table is the accessible alternative). */
export function Donut({ slices, centerLabel, centerValue }: { slices: { label: string; value: number }[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" width="148" height="148" aria-hidden className="shrink-0">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e2b45" strokeWidth="14" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * circ;
            const el = (
              <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="66" textAnchor="middle" fill={C.ink3} fontSize="9">
          {centerLabel}
        </text>
        <text x="70" y="82" textAnchor="middle" fill="#ece5d3" fontSize="13" fontWeight="600">
          {centerValue}
        </text>
      </svg>
      <table className="w-full text-sm">
        <caption className="sr-only">Allocation by position</caption>
        <tbody>
          {slices.map((s, i) => (
            <tr key={s.label} className="border-b border-line/50 last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-2">
                <span aria-hidden className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                {s.label}
              </th>
              <td className="num py-1.5 text-right text-ink">{total ? pct(s.value / total, 1, false) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Correlation matrix as a real table, cells tinted by value. */
export function CorrelationTable({ symbols, matrix, caption }: { symbols: string[]; matrix: (number | null)[][]; caption: string }) {
  const tint = (v: number | null) => {
    if (v === null) return 'transparent';
    const a = Math.min(1, Math.abs(v)) * 0.45;
    return v >= 0 ? `rgba(60,200,192,${a})` : `rgba(224,108,108,${a})`;
  };
  return (
    <div className="relative overflow-x-auto">
      <table className="text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td />
            {symbols.map((s) => (
              <th key={s} scope="col" className="px-3 py-1.5 text-right font-medium text-ink-3">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((row, i) => (
            <tr key={row}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-ink-3">
                {row}
              </th>
              {symbols.map((col, j) => (
                <td key={col} className="num px-3 py-1.5 text-right text-ink" style={{ background: tint(matrix[i]?.[j] ?? null) }}>
                  {matrix[i]?.[j] === null || matrix[i]?.[j] === undefined ? '—' : num(matrix[i]![j]!, 2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
