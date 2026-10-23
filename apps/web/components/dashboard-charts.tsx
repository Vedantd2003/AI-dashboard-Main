'use client';

/**
 * Animated dashboard charts. Every chart draws only the data it is given — no sample or filler values.
 * Motion: marks grow from the baseline / draw along their path once, on mount or when data changes; with
 * `prefers-reduced-motion` they appear in place. Each chart has a hover layer and a text/table alternative.
 */
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx, dateShort, money, num, pct } from '@/lib/format';

/** Categorical slots, validated for the dark surface (#111a2e): lightness band, chroma, CVD and contrast all pass. */
export const VIZ = {
  series: ['#1f9e96', '#d9702b', '#3987e5', '#c98500', '#d55181', '#9085e9'],
  up: '#3fb68b',
  down: '#e06c6c',
  warn: '#d9a441',
  neutral: '#5b6478',
  grid: '#22304a',
  ink: '#ece5d3',
  ink2: '#b7b2a5',
  ink3: '#8a90a0',
  surface: '#111a2e',
};

const EASE = [0.22, 1, 0.36, 1] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Floating tooltip positioned inside a `relative` container. */
function Tip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(x + 12, 4), Math.max(4, width - 184));
  return (
    <div role="status" className="pointer-events-none absolute z-10 w-44 rounded-md border border-line-strong bg-surface-3/95 px-2.5 py-2 text-caption shadow-lg backdrop-blur" style={{ left, top: Math.max(0, y - 8) }}>
      {children}
    </div>
  );
}

// ───────────────────────── Count-up number ─────────────────────────

export function CountUp({ value, format = (v) => num(v, 0), className }: { value: number; format?: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) return mv.set(value);
    if (!inView) return;
    const c = animate(mv, value, { duration: 1.1, ease: EASE });
    return () => c.stop();
  }, [value, inView, reduce, mv]);
  return (
    <span ref={ref} className={cx('num', className)}>
      <motion.span>{text}</motion.span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

// ───────────────────────── Stat tile with radial gauge ─────────────────────────

export function StatTile({ label, value, format, sub, gauge, tone = 'signal' }: { label: string; value: number | null; format?: (v: number) => string; sub?: ReactNode; gauge?: number | null; tone?: 'signal' | 'up' | 'down' | 'warn' }) {
  const reduce = useReducedMotion();
  const color = tone === 'up' ? VIZ.up : tone === 'down' ? VIZ.down : tone === 'warn' ? VIZ.warn : VIZ.series[0]!;
  const r = 17;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface-1 px-4 py-3.5">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-[0.10] blur-2xl" style={{ background: color }} />
      {typeof gauge === 'number' && (
        <svg viewBox="0 0 44 44" className="size-11 shrink-0" aria-hidden>
          <circle cx="22" cy="22" r={r} fill="none" stroke={VIZ.grid} strokeWidth="4" />
          <motion.circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: reduce ? circ * (1 - gauge) : circ }}
            whileInView={{ strokeDashoffset: circ * (1 - Math.max(0, Math.min(1, gauge))) }}
            viewport={{ once: true }}
            transition={{ duration: reduce ? 0 : 1.2, ease: EASE }}
          />
        </svg>
      )}
      <div className="min-w-0">
        <p className="truncate text-caption uppercase tracking-wide text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-ink">{value === null ? <span className="text-ink-3">—</span> : <CountUp value={value} format={format} />}</p>
        {sub && <p className="truncate text-caption text-ink-3">{sub}</p>}
      </div>
    </div>
  );
}

// ───────────────────────── Diverging movers bars ─────────────────────────

export interface MoverRow {
  symbol: string;
  label?: string;
  changePct: number;
  price: number | null;
  currency: string | null;
}

/** Today's % change per symbol as diverging horizontal bars around zero. Sign + value are always printed. */
export function MoversChart({ rows, caption }: { rows: MoverRow[]; caption: string }) {
  const reduce = useReducedMotion();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.changePct - a.changePct), [rows]);
  const max = Math.max(0.005, ...sorted.map((r) => Math.abs(r.changePct)));
  const rowH = 30;
  const labelW = 64;
  const valueW = 64;
  const plotW = Math.max(60, width - labelW - valueW);
  const mid = labelW + plotW / 2;
  const h = sorted.length * rowH;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={h + 18} role="img" aria-label={caption}>
          <line x1={mid} x2={mid} y1={0} y2={h} stroke={VIZ.grid} strokeWidth="1" />
          {sorted.map((r, i) => {
            const w = (Math.abs(r.changePct) / max) * (plotW / 2 - 4);
            const up = r.changePct >= 0;
            const y = i * rowH + 7;
            const x = up ? mid + 1 : mid - 1 - w;
            return (
              <g key={r.symbol} onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: y + 18 })} className="cursor-default">
                <rect x={0} y={i * rowH} width={width} height={rowH} fill={hover?.i === i ? '#ffffff08' : 'transparent'} />
                <text x={0} y={y + 12} fill={VIZ.ink} fontSize="12" fontWeight="500">
                  {r.symbol}
                </text>
                <motion.rect
                  y={y}
                  height={16}
                  rx={4}
                  fill={up ? VIZ.up : VIZ.down}
                  initial={{ width: reduce ? w : 0, x: reduce ? x : mid }}
                  animate={{ width: Math.max(2, w), x }}
                  transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : i * 0.05, ease: EASE }}
                />
                <text x={width} y={y + 12} textAnchor="end" fill={up ? VIZ.up : VIZ.down} fontSize="12" className="num">
                  {pct(r.changePct)}
                </text>
              </g>
            );
          })}
          <text x={labelW} y={h + 14} fill={VIZ.ink3} fontSize="10">
            −{pct(max, 1, false)}
          </text>
          <text x={mid} y={h + 14} fill={VIZ.ink3} fontSize="10" textAnchor="middle">
            0
          </text>
          <text x={labelW + plotW} y={h + 14} fill={VIZ.ink3} fontSize="10" textAnchor="end">
            +{pct(max, 1, false)}
          </text>
        </svg>
      )}
      {hover && sorted[hover.i] && (
        <Tip x={hover.x} y={hover.y} width={width}>
          <p className="font-medium text-ink">{sorted[hover.i]!.label ?? sorted[hover.i]!.symbol}</p>
          <p className="text-ink-2">Price {money(sorted[hover.i]!.price, sorted[hover.i]!.currency ?? 'USD')}</p>
          <p className="text-ink-2">Today {pct(sorted[hover.i]!.changePct)}</p>
        </Tip>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.symbol}>
              <th scope="row">{r.symbol}</th>
              <td>{pct(r.changePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Day range ─────────────────────────

export interface RangeRow {
  symbol: string;
  label: string;
  low: number;
  high: number;
  price: number;
  previousClose: number | null;
  currency: string | null;
}

/** Where the current price sits inside today's low–high range; the tick marks the previous close. */
export function DayRange({ rows }: { rows: RangeRow[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r, i) => {
        const span = r.high - r.low || 1;
        const at = Math.max(0, Math.min(1, (r.price - r.low) / span));
        const pc = r.previousClose === null ? null : Math.max(0, Math.min(1, (r.previousClose - r.low) / span));
        const up = r.previousClose === null || r.price >= r.previousClose;
        return (
          <li key={r.symbol}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink-2">{r.label}</span>
              <span className="num text-ink">{money(r.price, r.currency ?? 'USD')}</span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-3" role="img" aria-label={`${r.label}: ${money(r.price)} within today's range ${money(r.low)} to ${money(r.high)}`}>
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: `linear-gradient(90deg, ${VIZ.series[0]}22, ${up ? VIZ.up : VIZ.down})` }}
                initial={{ width: reduce ? `${at * 100}%` : 0 }}
                animate={{ width: `${at * 100}%` }}
                transition={{ duration: reduce ? 0 : 1, delay: reduce ? 0 : i * 0.08, ease: EASE }}
              />
              {pc !== null && <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded bg-ink-3" style={{ left: `calc(${pc * 100}% - 1px)` }} title="Previous close" />}
              <motion.span
                aria-hidden
                className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-surface-1"
                style={{ background: up ? VIZ.up : VIZ.down }}
                initial={{ left: reduce ? `calc(${at * 100}% - 7px)` : '-7px' }}
                animate={{ left: `calc(${at * 100}% - 7px)` }}
                transition={{ duration: reduce ? 0 : 1, delay: reduce ? 0 : i * 0.08, ease: EASE }}
              />
            </div>
            <div className="num mt-1 flex justify-between text-caption text-ink-3">
              <span>L {num(r.low)}</span>
              <span>H {num(r.high)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────── Ring (donut) ─────────────────────────

export interface Segment {
  label: string;
  value: number;
  color: string;
  detail?: string;
}

/** Animated donut with a legend table (the accessible alternative). Segments separated by a 2px surface gap. */
export function Ring({ segments, center, centerSub, caption, valueFormat = (v, t) => pct(v / t, 1, false) }: { segments: Segment[]; center: ReactNode; centerSub?: string; caption: string; valueFormat?: (v: number, total: number) => string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const stroke = 16;
  const circ = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0">
        <svg viewBox="0 0 160 160" width="168" height="168" role="img" aria-label={caption}>
          <circle cx="80" cy="80" r={r} fill="none" stroke={VIZ.grid} strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (s.value / total) * circ;
              const dash = Math.max(0, len - gap);
              const start = offset;
              offset += len;
              if (s.value <= 0) return null;
              return (
                <motion.circle
                  key={s.label}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === i ? stroke + 4 : stroke}
                  strokeLinecap="butt"
                  transform="rotate(-90 80 80)"
                  strokeDashoffset={-start}
                  initial={{ strokeDasharray: reduce ? `${dash} ${circ}` : `0 ${circ}`, opacity: active === null || active === i ? 1 : 0.35 }}
                  animate={{ strokeDasharray: `${dash} ${circ}`, opacity: active === null || active === i ? 1 : 0.35 }}
                  transition={{ duration: reduce ? 0 : 1.1, delay: reduce ? 0 : i * 0.12, ease: EASE }}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num max-w-[104px] truncate text-xl font-semibold text-ink">{active !== null && segments[active] ? valueFormat(segments[active]!.value, total) : center}</span>
          <span className="max-w-24 text-caption text-ink-3">{active !== null && segments[active] ? segments[active]!.label : centerSub}</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {segments.map((s, i) => (
            <tr key={s.label} className={cx('border-b border-line/50 transition-colors last:border-0', active === i && 'bg-white/[0.03]')} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <th scope="row" className="py-1.5 text-left font-normal text-ink-2">
                <span aria-hidden className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: s.color }} />
                {s.label}
                {s.detail && <span className="block pl-[18px] text-caption text-ink-3">{s.detail}</span>}
              </th>
              <td className="num py-1.5 text-right text-ink">{total ? valueFormat(s.value, total) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Area chart ─────────────────────────

/** Single-series price area that draws itself in, with a crosshair tooltip. */
export function AnimatedArea({ points, caption, currency = 'USD', height = 220 }: { points: { date: string; close: number }[]; caption: string; currency?: string | null; height?: number }) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const padL = 8;
  const padR = 56;
  const padT = 12;
  const padB = 22;
  const { path, area, xs, ys, min, max } = useMemo(() => {
    const vals = points.map((p) => p.close);
    const lo = Math.min(...vals);
    const hiV = Math.max(...vals);
    const span = hiV - lo || 1;
    const w = Math.max(1, width - padL - padR);
    const h = height - padT - padB;
    const xs = points.map((_, i) => padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * w));
    const ys = points.map((p) => padT + h - ((p.close - lo) / span) * h);
    const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
    const area = `${path} L${xs.at(-1)!.toFixed(1)},${padT + h} L${padL},${padT + h} Z`;
    return { path, area, xs, ys, min: lo, max: hiV };
  }, [points, width, height]);
  if (points.length < 2) return <p className="text-sm text-ink-3">Not enough data points to draw a chart.</p>;
  const up = points.at(-1)!.close >= points[0]!.close;
  const color = up ? VIZ.up : VIZ.down;
  const ticks = [max, (max + min) / 2, min];
  const h = height - padT - padB;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={caption}
          onMouseMove={(e) => {
            const x = e.nativeEvent.offsetX;
            let best = 0;
            for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - x) < Math.abs(xs[best]! - x)) best = i;
            setHi(best);
          }}
        >
          <defs>
            <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => {
            const y = padT + (i / 2) * h;
            return (
              <g key={i}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke={VIZ.grid} strokeDasharray="2 4" />
                <text x={width - padR + 6} y={y + 4} fill={VIZ.ink3} fontSize="10" className="num">
                  {num(t)}
                </text>
              </g>
            );
          })}
          <motion.path d={area} fill={`url(#g${gid})`} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : 0.5 }} />
          <motion.path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 1.4, ease: EASE }} />
          <motion.circle cx={xs.at(-1)} cy={ys.at(-1)} r="4" fill={color} stroke={VIZ.surface} strokeWidth="2" initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 1.3 }} />
          <text x={padL} y={height - 6} fill={VIZ.ink3} fontSize="10">
            {dateShort(points[0]!.date)}
          </text>
          <text x={width - padR} y={height - 6} fill={VIZ.ink3} fontSize="10" textAnchor="end">
            {dateShort(points.at(-1)!.date)}
          </text>
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={xs[hi]} x2={xs[hi]} y1={padT} y2={padT + h} stroke={VIZ.ink3} strokeDasharray="3 3" />
              <circle cx={xs[hi]} cy={ys[hi]} r="5" fill={color} stroke={VIZ.surface} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hi !== null && points[hi] && (
        <Tip x={xs[hi]!} y={ys[hi]! - 40} width={width}>
          <p className="text-ink-3">{dateShort(points[hi]!.date)}</p>
          <p className="num font-medium text-ink">{money(points[hi]!.close, currency ?? 'USD')}</p>
          <p className="num text-ink-2">{pct(points[hi]!.close / points[0]!.close - 1)} since start</p>
        </Tip>
      )}
    </div>
  );
}

// ───────────────────────── Stacked activity bars ─────────────────────────

export interface ActivityDay {
  date: string;
  succeeded: number;
  failed: number;
  skipped: number;
}

/** Workflow runs per day, stacked by outcome. Status colors carry a legend with labels (never color alone). */
export function ActivityBars({ days, caption, height = 150 }: { days: ActivityDay[]; caption: string; height?: number }) {
  const reduce = useReducedMotion();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const keys = [
    { k: 'succeeded', label: 'Succeeded', color: VIZ.up },
    { k: 'failed', label: 'Failed', color: VIZ.down },
    { k: 'skipped', label: 'Skipped', color: VIZ.neutral },
  ] as const;
  const max = Math.max(1, ...days.map((d) => d.succeeded + d.failed + d.skipped));
  const padB = 18;
  const plotH = height - padB;
  const slot = width / Math.max(1, days.length);
  const barW = Math.max(4, Math.min(22, slot - 6));
  return (
    <div>
      <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={caption}>
            <line x1={0} x2={width} y1={plotH} y2={plotH} stroke={VIZ.grid} />
            {days.map((d, i) => {
              const x = i * slot + (slot - barW) / 2;
              let y = plotH;
              return (
                <g key={d.date} onMouseEnter={() => setHi(i)}>
                  <rect x={i * slot} y={0} width={slot} height={plotH} fill={hi === i ? '#ffffff08' : 'transparent'} />
                  {keys.map(({ k, color }, j) => {
                    const v = d[k];
                    if (!v) return null;
                    const bh = (v / max) * (plotH - 6);
                    y -= bh;
                    const top = y;
                    y -= 2; // 2px surface gap between stacked segments
                    return (
                      <motion.rect
                        key={k}
                        x={x}
                        width={barW}
                        rx={3}
                        fill={color}
                        initial={{ height: reduce ? Math.max(1, bh) : 0, y: reduce ? top : plotH }}
                        animate={{ height: Math.max(1, bh), y: top }}
                        transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.035 + j * 0.1, ease: EASE }}
                      />
                    );
                  })}
                  {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                    <text x={i === 0 ? 0 : i === days.length - 1 ? width : i * slot + slot / 2} y={height - 4} fill={VIZ.ink3} fontSize="10" textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>
                      {dateShort(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hi !== null && days[hi] && (
          <Tip x={hi * slot + slot / 2} y={8} width={width}>
            <p className="text-ink-3">{dateShort(days[hi]!.date)}</p>
            {keys.map(({ k, label, color }) => (
              <p key={k} className="flex items-center justify-between gap-2 text-ink-2">
                <span>
                  <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: color }} />
                  {label}
                </span>
                <span className="num text-ink">{days[hi]![k]}</span>
              </p>
            ))}
          </Tip>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2" aria-label="Legend">
        {keys.map(({ k, label, color }) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Date</th>
            {keys.map((k) => (
              <th key={k.k}>{k.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.succeeded}</td>
              <td>{d.failed}</td>
              <td>{d.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
