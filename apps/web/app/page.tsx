import Link from 'next/link';
import { Bell, BriefcaseBusiness, ChartCandlestick, FileSearch, ListChecks, Lock, Workflow } from 'lucide-react';
import { FINANCIAL_DISCLAIMER } from '@alphapulse/shared';
import { Logo } from '@/components/logo';
import { BasisLegend } from '@/components/research-note';
import { HeroNote } from '@/components/landing/hero-note';

const PIPELINE = [
  { t: 'Validate the question', d: 'Symbols are normalized and checked before anything is fetched.' },
  { t: 'Collect market data', d: 'Quotes, a year of daily closes, profile and reported metrics, each stamped with provider and time.' },
  { t: 'Gather sources', d: 'Company news, recent SEC filings and any documents you uploaded.' },
  { t: 'Deduplicate and rank', d: 'Syndicated copies are removed; primary filings rank above news.' },
  { t: 'Calculate', d: 'Returns, volatility, drawdown and correlation are computed in code, not by the model.' },
  { t: 'Write the note', d: 'The model sees only the data and the sources, with instructions inside sources ignored.' },
  { t: 'Verify citations', d: 'Every quoted passage is matched against the stored source text. Misses are marked unverified.' },
];

const SOURCES = [
  { name: 'Twelve Data', use: 'Quotes, daily history, symbol search', note: 'Quotes are delayed on the free plan. US listings only on the free plan.' },
  { name: 'Finnhub', use: 'Company news, profiles, reported metrics', note: 'Metric definitions and periods follow the provider and are shown beside each value.' },
  { name: 'SEC EDGAR', use: 'Filings index and filing text', note: 'Official primary source for US issuers, accessed under the SEC fair-access policy.' },
  { name: 'Your documents and feeds', use: 'PDF, text and RSS you add', note: 'Private to you. Treated as untrusted input.' },
];

export default function Landing() {
  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(60,200,192,0.10),transparent)]" />

      <header className="relative mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 lg:px-8">
        <Link href="/" aria-label="AlphaPulse AI home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden rounded px-3 py-2 text-sm text-ink-2 hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#sources" className="hidden rounded px-3 py-2 text-sm text-ink-2 hover:text-ink sm:inline">
            Data sources
          </a>
          <Link href="/login" className="rounded px-3 py-2 text-sm text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/register" className="rounded-[var(--radius-control)] bg-ink px-3.5 py-2 text-sm font-medium text-bg hover:bg-white">
            Create account
          </Link>
        </nav>
      </header>

      <main id="main" className="relative">
        <section className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pt-14 pb-20 lg:grid-cols-[1fr_minmax(0,560px)] lg:px-8 lg:pt-20">
          <div className="max-w-[34rem]">
            <h1 className="font-serif text-[2.75rem] leading-[1.05] font-medium tracking-tight text-balance sm:text-[3.75rem]">From market signals to investment intelligence.</h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-2">
              AlphaPulse reads prices, company news and SEC filings for the companies you follow, then writes research notes where every sourced claim points to the passage that supports it.
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-2">Check any line in seconds. When the evidence isn’t there, the note says so.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="rounded-[var(--radius-control)] bg-ink px-5 py-3 text-base font-medium text-bg hover:bg-white">
                Start researching
              </Link>
              <a href="#how" className="rounded-[var(--radius-control)] border border-line-strong px-5 py-3 text-base text-ink hover:border-ink-3">
                See how a note is built
              </a>
            </div>
            <p className="mt-6 text-sm text-ink-3">Research and decision support only. AlphaPulse never places trades and doesn’t connect to brokerage accounts.</p>
          </div>
          <HeroNote />
        </section>

        <section aria-labelledby="margin-h" className="border-y border-line bg-surface-1/40">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 py-16 lg:grid-cols-[340px_1fr] lg:px-8">
            <div>
              <h2 id="margin-h" className="font-serif text-3xl leading-tight">Every line says what kind of claim it is</h2>
              <p className="mt-3 text-base text-ink-2">A fact from a filing, a number AlphaPulse calculated, and the model’s opinion are different things. The margin mark tells you which one you’re reading.</p>
            </div>
            <BasisLegend className="self-center" />
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="mx-auto max-w-[1200px] px-4 py-20 lg:px-8">
          <h2 id="how-h" className="max-w-[24ch] font-serif text-3xl leading-tight">What happens when you ask a question</h2>
          <p className="mt-3 max-w-[60ch] text-base text-ink-2">The same pipeline runs for a one-off question, a scheduled morning brief, or a weekly digest. Each run keeps a step log you can inspect.</p>
          <ol className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((p, i) => (
              <li key={p.t} className="border-t border-line-strong pt-4">
                <span className="num text-sm text-signal">Step {i + 1}</span>
                <h3 className="mt-1 text-base font-semibold">{p.t}</h3>
                <p className="mt-1 text-sm text-ink-2">{p.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="feat-h" className="border-t border-line">
          <div className="mx-auto max-w-[1200px] px-4 py-20 lg:px-8">
            <h2 id="feat-h" className="font-serif text-3xl">One workspace for the whole research loop</h2>
            <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line md:grid-cols-3">
              {[
                { i: ChartCandlestick, t: 'Markets', d: 'Company pages with price history, reported metrics with their periods, news and filings. Compare up to five companies on returns, volatility and correlation.' },
                { i: ListChecks, t: 'Watchlists', d: 'Group the companies you follow, keep private notes on each, and see delayed quotes with one-month trends.' },
                { i: Bell, t: 'Alerts', d: 'Price levels and daily-move rules, checked on schedule, delivered in-app, by email or to Slack and Discord, with no duplicate pings.' },
                { i: FileSearch, t: 'AI Analyst', d: 'Summaries, earnings readouts, bull and bear cases, risk scans and follow-up questions, all grounded in retrieved sources.' },
                { i: BriefcaseBusiness, t: 'Portfolio Lab', d: 'Model hypothetical holdings to study allocation, concentration, drawdown and benchmark-relative performance.' },
                { i: Workflow, t: 'Automations', d: 'Daily briefs on trading days, a watchlist monitor, a weekly digest and a data-source health check, run by n8n or the built-in scheduler.' },
              ].map((f) => (
                <div key={f.t} className="bg-bg p-6">
                  <f.i className="size-5 text-signal" aria-hidden />
                  <h3 className="mt-3 text-base font-semibold">{f.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="sources" aria-labelledby="src-h" className="border-t border-line bg-surface-1/40">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-4 py-20 lg:grid-cols-2 lg:px-8">
            <div>
              <h2 id="src-h" className="font-serif text-3xl">Where the data comes from</h2>
              <p className="mt-3 max-w-[56ch] text-base text-ink-2">Every number carries its provider and timestamp. If a provider doesn’t cover a market or a metric, AlphaPulse tells you instead of filling the gap.</p>
              <dl className="mt-8 divide-y divide-line border-y border-line">
                {SOURCES.map((s) => (
                  <div key={s.name} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[180px_1fr]">
                    <dt className="font-medium">{s.name}</dt>
                    <dd className="text-sm text-ink-2">
                      {s.use}.<span className="mt-0.5 block text-ink-3">{s.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="flex items-center gap-2 font-serif text-3xl">
                <Lock className="size-6 text-gold" aria-hidden /> How your account is protected
              </h2>
              <ul className="mt-8 space-y-4 text-base text-ink-2">
                <li>Passwords are hashed with Argon2id. Sessions use HttpOnly cookies, never browser storage.</li>
                <li>Your watchlists, portfolios, notes, documents and reports are visible only to you unless you share a report link, which you can revoke.</li>
                <li>Data-provider and model keys stay on the server and never reach your browser.</li>
                <li>Links and feeds you add are fetched through a guard that blocks private networks and cloud metadata addresses.</li>
                <li>Text inside articles and uploads is treated as data. Instructions hidden in a document can’t redirect the analyst.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <h2 className="max-w-[22ch] font-serif text-3xl leading-tight">Start with the five companies you already follow.</h2>
            <Link href="/register" className="rounded-[var(--radius-control)] bg-ink px-5 py-3 text-base font-medium text-bg hover:bg-white">
              Create an account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-4 py-10 text-sm text-ink-3 md:grid-cols-[1fr_2fr] lg:px-8">
          <div>
            <Logo />
            <p className="mt-3">
              <a href="/api/v1/docs" className="hover:text-ink hover:underline">
                API documentation
              </a>
            </p>
          </div>
          <div className="space-y-3">
            <p>{FINANCIAL_DISCLAIMER}</p>
            <p>Market data may be delayed and may contain errors. Provider attribution and timestamps are shown with each value. Past performance and technical indicators do not predict future results.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
