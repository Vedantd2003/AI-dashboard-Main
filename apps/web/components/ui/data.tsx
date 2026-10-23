'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cx, pct, relative } from '@/lib/format';
import type { Freshness } from '@/lib/types';

/** Signed change: sign + arrow + colour, so meaning never depends on colour alone. */
export function Delta({ value, className, digits = 2 }: { value: number | null | undefined; className?: string; digits?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cx('num text-ink-3', className)}>—</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cx('num inline-flex items-center gap-0.5', value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-ink-2', className)}>
      <Icon className="size-3.5" aria-hidden />
      {pct(value, digits)}
    </span>
  );
}

const FRESH: Record<Freshness, { label: string; cls: string; title: string }> = {
  realtime: { label: 'Real-time', cls: 'text-up border-up/40', title: 'Provider reports this as real-time' },
  delayed: { label: 'Delayed', cls: 'text-warn border-warn/40', title: 'Quotes on this plan are delayed; not suitable for trading decisions' },
  eod: { label: 'End of day', cls: 'text-info border-info/40', title: 'Daily closing prices' },
};

export function FreshnessBadge({ freshness, asOf, provider }: { freshness: Freshness; asOf?: string | null; provider?: string }) {
  const f = FRESH[freshness];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-3">
      <span title={f.title} className={cx('rounded-full border px-2 py-px', f.cls)}>
        {f.label}
      </span>
      {provider && <span>{provider}</span>}
      {asOf && <span title={asOf}>as of {relative(asOf)}</span>}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'up' | 'down' | 'warn' | 'info' | 'gold' | 'signal'; title?: string }) {
  const tones = {
    neutral: 'border-line-strong text-ink-2',
    up: 'border-up/40 text-up',
    down: 'border-down/40 text-down',
    warn: 'border-warn/40 text-warn',
    info: 'border-info/40 text-info',
    gold: 'border-gold/50 text-gold',
    signal: 'border-signal/40 text-signal',
  } as const;
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-px text-caption whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: 'ok' | 'degraded' | 'down' | 'not_configured' | 'never_checked' | 'succeeded' | 'failed' | 'running' | 'skipped' | string }) {
  const map: Record<string, { cls: string; label: string }> = {
    ok: { cls: 'bg-up', label: 'Operational' },
    succeeded: { cls: 'bg-up', label: 'Succeeded' },
    degraded: { cls: 'bg-warn', label: 'Degraded' },
    running: { cls: 'bg-info animate-pulse', label: 'Running' },
    skipped: { cls: 'bg-ink-3', label: 'Skipped' },
    down: { cls: 'bg-down', label: 'Down' },
    failed: { cls: 'bg-down', label: 'Failed' },
    not_configured: { cls: 'bg-ink-3/50 ring-1 ring-ink-3', label: 'Not configured' },
    never_checked: { cls: 'bg-ink-3/50', label: 'Not checked yet' },
  };
  const m = map[status] ?? { cls: 'bg-ink-3', label: status };
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
      <span aria-hidden className={cx('size-2 rounded-full', m.cls)} />
      {m.label}
    </span>
  );
}

/** Table that scrolls horizontally inside its panel on small screens; numeric columns right-aligned. */
export function DataTable({ caption, head, children, className }: { caption: string; head: { label: ReactNode; align?: 'left' | 'right'; className?: string }[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('relative -mx-4 overflow-x-auto', className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cx('px-4 py-2 font-medium whitespace-nowrap text-ink-3', h.align === 'right' ? 'text-right' : 'text-left', h.className)}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line/60 [&>tr:last-child]:border-0 [&>tr:hover]:bg-surface-2/60 [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="num mt-0.5 text-lg font-medium text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-caption text-ink-3">{sub}</dd>}
    </div>
  );
}
