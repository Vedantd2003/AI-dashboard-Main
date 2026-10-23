'use client';

import type { ReactNode } from 'react';
import { dateShort, dateTime, money, num, pct } from '@/lib/format';
import type { Report, SeriesSummary } from '@/lib/types';
import { Badge } from './ui/data';
import { BasisLegend, ClaimSection, SourceList } from './research-note';

const STRENGTH: Record<Report['evidenceStrength'], { tone: 'down' | 'warn' | 'up'; label: string; title: string }> = {
  weak: { tone: 'down', label: 'Weak evidence', title: 'Few or low-quality sources. Not a probability.' },
  moderate: { tone: 'warn', label: 'Moderate evidence', title: 'Some supporting sources. Not a probability.' },
  strong: { tone: 'up', label: 'Strong evidence', title: 'Multiple consistent sources. Not a probability.' },
};

const KIND = { research: 'Research note', daily_brief: 'Daily brief', weekly_digest: 'Weekly digest' } as const;

function MetricsBlock({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) return null;
  return (
    <section className="border-t border-line pt-5">
      <h3 className="font-serif text-xl text-ink">Data used</h3>
      <p className="mt-1 text-sm text-ink-3">Observed and calculated by AlphaPulse before the analysis was written. One-year window of daily closes.</p>
      <div className="relative mt-3 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Market data used in this report</caption>
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="px-1 py-2 text-left font-medium">Symbol</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Last price</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">1Y return</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Ann. volatility</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Max drawdown</th>
              <th scope="col" className="px-1 py-2 text-left font-medium">Window</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([sym, raw]) => {
              const m = raw as { quote?: { price: number | null; currency: string | null }; oneYear?: SeriesSummary };
              return (
                <tr key={sym} className="border-b border-line/50 last:border-0">
                  <th scope="row" className="px-1 py-2 text-left font-medium">{sym}</th>
                  <td className="num px-1 py-2 text-right">{m.quote ? money(m.quote.price, m.quote.currency ?? 'USD') : '—'}</td>
                  <td className="num px-1 py-2 text-right">{pct(m.oneYear?.periodReturn)}</td>
                  <td className="num px-1 py-2 text-right">{pct(m.oneYear?.annualizedVolatility, 1, false)}</td>
                  <td className="num px-1 py-2 text-right">{pct(m.oneYear?.maxDrawdown, 1)}</td>
                  <td className="px-1 py-2 text-ink-3">{m.oneYear ? `${dateShort(m.oneYear.start)} to ${dateShort(m.oneYear.end)}` : 'Unavailable'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(() => {
        const c = metrics._correlation as { symbols: string[]; matrix: (number | null)[][]; observations: number } | undefined;
        if (!c || c.symbols.length < 2) return null;
        return (
          <p className="mt-2 text-caption text-ink-3">
            Correlation of daily returns ({c.observations} observations):{' '}
            {c.symbols.flatMap((a, i) => c.symbols.slice(i + 1).map((b, j) => `${a}/${b} ${num(c.matrix[i]?.[i + 1 + j] ?? null)}`)).join(', ')}.
          </p>
        );
      })()}
    </section>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="border-t border-line pt-5">
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base text-ink-2 marker:text-ink-3">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

export function ReportView({ report, toolbar }: { report: Report; toolbar?: ReactNode }) {
  const s = STRENGTH[report.evidenceStrength] ?? STRENGTH.weak;
  const fresh = Object.entries(report.dataFreshness ?? {});
  return (
    <article className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <header>
          <p className="text-sm text-ink-3">
            {KIND[report.kind]} for {report.symbols.join(', ')}, generated {dateTime(report.generatedAt)}
          </p>
          <h1 className="mt-2 font-serif text-[2.25rem] leading-[1.15] font-medium text-balance">{report.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={s.tone} title={s.title}>
              {s.label}
            </Badge>
            <Badge tone="gold" title="Source-reported claims whose quoted passage was found in the stored source text. Calculations and interpretations don’t need citations.">
              {report.citationStats?.verified ?? 0} of {(report.citationStats?.verified ?? 0) + (report.citationStats?.downgraded ?? 0)} sourced claims verified
            </Badge>
            {(report.citationStats?.downgraded ?? 0) > 0 && <Badge tone="down">{report.citationStats.downgraded} unverified</Badge>}
          </div>
          {toolbar && <div className="no-print mt-4 flex flex-wrap gap-2">{toolbar}</div>}
        </header>

        <section className="mt-8">
          <h2 className="sr-only">Question</h2>
          <p className="border-l-2 border-line-strong pl-4 text-base text-ink-2 italic">{report.researchQuestion}</p>
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-2xl text-ink">Summary</h2>
          <p className="note-prose mt-2">{report.executiveSummary}</p>
        </section>

        <div className="mt-8 flex flex-col gap-6">
          <ClaimSection title="Key findings" claims={report.keyFindings} sources={report.sourceReferences} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ClaimSection title="Bullish factors" claims={report.bullishFactors} sources={report.sourceReferences} empty="No bullish factors were supported by the evidence." />
            <ClaimSection title="Bearish factors" claims={report.bearishFactors} sources={report.sourceReferences} empty="No bearish factors were supported by the evidence." />
          </div>
          <ClaimSection title="Risks" claims={report.risks} sources={report.sourceReferences} empty="No specific risks were identified in the retrieved sources." />
          <MetricsBlock metrics={report.financialMetrics ?? {}} />
          <ListBlock title="What is uncertain" items={report.uncertainties} empty="None noted." />
          <ListBlock title="Questions for further research" items={report.followUpQuestions} empty="None suggested." />
          <ListBlock title="Limitations" items={report.limitations} empty="None recorded." />
        </div>

        <footer className="mt-10 rounded-[var(--radius-panel)] border border-line bg-surface-1 px-4 py-3 text-sm text-ink-2">{report.disclaimer}</footer>
      </div>

      <aside className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
        <section aria-labelledby="src-h" className="rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4">
          <h2 id="src-h" className="text-base font-semibold">Sources</h2>
          <div className="mt-3">
            <SourceList sources={report.sourceReferences} />
          </div>
        </section>
        <section aria-labelledby="key-h" className="rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4">
          <h2 id="key-h" className="mb-3 text-base font-semibold">How to read the margin</h2>
          <BasisLegend className="!grid-cols-1" />
        </section>
        <section aria-labelledby="fr-h" className="rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 text-sm">
          <h2 id="fr-h" className="text-base font-semibold">Data freshness</h2>
          {fresh.length ? (
            <ul className="mt-2 space-y-1 text-ink-2">
              {fresh.map(([k, v]) => (
                <li key={k}>
                  <span className="text-ink">{k.replace('.', ' ')}</span>: {v.provider ?? 'unknown'}, {v.freshness ?? 'retrieved'} {v.asOf ? `as of ${dateTime(v.asOf)}` : v.retrievedAt ? dateTime(v.retrievedAt) : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-3">No market data was available when this was generated.</p>
          )}
          <p className="mt-3 text-caption text-ink-3">Model: {report.model}</p>
        </section>
      </aside>
    </article>
  );
}

export function reportPlainText(r: Report): string {
  const claims = (t: string, cs: Report['keyFindings']) => (cs.length ? `${t}\n${cs.map((c) => `- ${c.text}${c.basis === 'unverified' ? ' (unverified)' : ''}`).join('\n')}\n` : '');
  return [`${r.title}`, `${dateTime(r.generatedAt)}`, '', r.executiveSummary, '', claims('Key findings', r.keyFindings), claims('Risks', r.risks), r.disclaimer].join('\n');
}
