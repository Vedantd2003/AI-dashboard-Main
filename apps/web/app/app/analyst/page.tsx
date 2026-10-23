'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { normalizeSymbols } from '@alphapulse/shared';
import { api, ApiError } from '@/lib/api';
import type { Paged, Report } from '@/lib/types';
import { ReportView } from '@/components/report-view';
import { Button, Field, Input, PageHeader, Panel, Select, Spinner, Textarea } from '@/components/ui/primitives';
import { ErrorState, NotConfigured } from '@/components/ui/states';

const TASKS = [
  { key: 'company_update', label: 'Latest developments', q: (s: string) => `What are the most important recent developments for ${s}?` },
  { key: 'price_move', label: 'Explain a price move', q: (s: string) => `What does the recent price action of ${s} show, and which reported events coincide with it?` },
  { key: 'compare', label: 'Compare companies', q: (s: string) => `How do ${s} compare on the available metrics and recent performance?` },
  { key: 'earnings', label: 'Summarize earnings', q: (s: string) => `Summarize the most recent earnings-related disclosures for ${s}.` },
  { key: 'risks', label: 'Material risks', q: (s: string) => `What potentially material risks appear in recent filings and news for ${s}?` },
  { key: 'bull_bear', label: 'Bull and bear case', q: (s: string) => `What are the bullish and bearish arguments for ${s} supported by current evidence?` },
  { key: 'themes', label: 'Recurring themes', q: (s: string) => `What themes recur across recent coverage of ${s}?` },
  { key: 'morning_brief', label: 'Morning brief', q: (s: string) => `Write a concise morning brief for ${s}.` },
  { key: 'custom', label: 'Your own question', q: () => '' },
] as const;

interface Caps {
  llm: { configured: boolean; provider?: string; model?: string; hint?: string };
  marketData: boolean;
  news: boolean;
  filings: boolean;
  dailyLimit: number;
}
interface Run {
  id: string;
  status: string;
  reportId?: string | null;
  steps: { name: string; status: 'ok' | 'skipped' | 'failed'; detail: string; ms: number }[];
  error: string | null;
}
interface Doc {
  id: string;
  title: string;
  extraction: { status: string };
}

const STEP_LABEL = (n: string) =>
  n === 'market_data' ? 'Market data' : n === 'sources' ? 'Deduplicate and rank sources' : n === 'generate' ? 'Generate analysis' : n === 'validate' ? 'Validate output' : n === 'citations' ? 'Verify citations' : n.startsWith('news:') ? `News for ${n.slice(5)}` : n.startsWith('filings:') ? `SEC filings for ${n.slice(8)}` : n === 'pipeline' ? 'Pipeline' : n;

function Steps({ run }: { run: Run }) {
  return (
    <ol className="space-y-2">
      {run.steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          {s.status === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 text-up" aria-label="Done" /> : s.status === 'failed' ? <XCircle className="mt-0.5 size-4 text-down" aria-label="Failed" /> : <CircleDashed className="mt-0.5 size-4 text-ink-3" aria-label="Skipped" />}
          <span>
            <span className="text-ink">{STEP_LABEL(s.name)}</span> <span className="text-ink-3">{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Analyst() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const initialSymbols = params.get('symbols') ?? '';
  const initialTask = (TASKS.find((t) => t.key === params.get('task'))?.key ?? 'company_update') as (typeof TASKS)[number]['key'];
  const [symbols, setSymbols] = useState(initialSymbols.replace(/,/g, ', '));
  const [task, setTask] = useState<(typeof TASKS)[number]['key']>(initialTask);
  const [question, setQuestion] = useState(() => (initialSymbols ? TASKS.find((t) => t.key === initialTask)!.q(initialSymbols.replace(/,/g, ', ')) : ''));
  const [lookback, setLookback] = useState(14);
  const [docs, setDocs] = useState<string[]>([]);
  const caps = useQuery({ queryKey: ['research', 'caps'], queryFn: () => api.get<Caps>('/research/capabilities') });
  const uploads = useQuery({ queryKey: ['documents', 'mine'], queryFn: () => api.get<Paged<Doc>>('/research/documents?mine=true&kind=upload&pageSize=50') });
  const parsed = normalizeSymbols(symbols.split(/[\s,]+/).filter(Boolean));

  // The run starts asynchronously (202) and is polled, so a long model call never hits a proxy timeout.
  const start = useMutation({ mutationFn: (body: object) => api.post<{ runId: string; status: string }>('/research?mode=async', body) });
  const runId = start.data?.runId;
  const runDetail = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.get<Run>(`/research/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'running' ? false : 2_000),
  });
  const reportId = runDetail.data?.status === 'succeeded' ? runDetail.data.reportId : null;
  const report = useQuery({ queryKey: ['report', reportId], queryFn: () => api.get<Report>(`/reports/${reportId}`), enabled: !!reportId });
  useEffect(() => {
    if (reportId) void qc.invalidateQueries({ queryKey: ['reports'] });
  }, [reportId, qc]);
  const running = start.isPending || (!!runId && (!runDetail.data || runDetail.data.status === 'running' || (!!reportId && report.isPending)));
  const failedRun = runDetail.data?.status === 'failed' ? runDetail.data : null;

  const canRun = parsed.valid.length > 0 && question.trim().length >= 8;

  return (
    <>
      <PageHeader title="AI Analyst" description="Ask a research question. The analyst reads current market data, news and filings, then writes a note where every sourced claim links to the passage that supports it." />
      {caps.data && !caps.data.llm.configured && (
        <div className="mb-4">
          <NotConfigured message="The AI model is not configured, so reports will contain only observed and calculated data." hint={caps.data.llm.hint} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel id="ask" title="Research question" className="xl:self-start">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate({ question: question.trim(), symbols: parsed.valid, task, lookbackDays: lookback, documentIds: docs });
            }}
          >
            <Field label="Symbols" htmlFor="an-s" hint="Up to five, separated by commas." error={parsed.invalid.length ? `Not a valid symbol: ${parsed.invalid.join(', ')}` : undefined}>
              <Input id="an-s" value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="AAPL, MSFT" />
            </Field>
            <Field label="Kind of question" htmlFor="an-t">
              <Select
                id="an-t"
                value={task}
                onChange={(e) => {
                  const t = TASKS.find((x) => x.key === e.target.value)!;
                  setTask(t.key);
                  if (t.key !== 'custom' && parsed.valid.length) setQuestion(t.q(parsed.valid.join(', ')));
                }}
              >
                {TASKS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Question" htmlFor="an-q" hint="Be specific about what you want to know.">
              <Textarea id="an-q" rows={4} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} />
            </Field>
            <Field label="Look back" htmlFor="an-l">
              <Select id="an-l" value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
                {[3, 7, 14, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} days of news
                  </option>
                ))}
              </Select>
            </Field>
            {!!uploads.data?.items.length && (
              <fieldset>
                <legend className="text-sm font-medium text-ink-2">Include your documents</legend>
                <div className="mt-1.5 flex max-h-36 flex-col gap-1 overflow-y-auto">
                  {uploads.data.items.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-ink-2">
                      <input type="checkbox" className="size-4 accent-[var(--color-signal)]" checked={docs.includes(d.id)} disabled={!docs.includes(d.id) && docs.length >= 5} onChange={(e) => setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))} />
                      <span className="truncate">{d.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Button type="submit" variant="primary" loading={running} disabled={!canRun} disabledReason="Add at least one valid symbol and a question of 8+ characters">
              Run research
            </Button>
            {caps.data && (
              <p className="text-caption text-ink-3">
                Sources available: {[caps.data.marketData && 'market data', caps.data.news && 'news', caps.data.filings && 'SEC filings'].filter(Boolean).join(', ') || 'none configured'}. Limit of {caps.data.dailyLimit} runs per day. Runs take up to a minute.
              </p>
            )}
          </form>
        </Panel>

        <div className="min-w-0">
          {running ? (
            <Panel title="Working on it">
              <Spinner label="Collecting data and sources, then writing the note. This usually takes 20–60 seconds." />
              {!!runDetail.data?.steps.length && (
                <div className="mt-4">
                  <Steps run={runDetail.data} />
                </div>
              )}
            </Panel>
          ) : start.isError || runDetail.isError || report.isError ? (
            <ErrorState title="Could not run research" error={start.error ?? runDetail.error ?? report.error} />
          ) : failedRun ? (
            <div className="flex flex-col gap-4">
              <ErrorState title="The research run failed" error={new ApiError(502, 'run_failed', failedRun.error ?? 'The research run failed.')} />
              <Panel title="What happened">
                <Steps run={failedRun} />
              </Panel>
            </div>
          ) : report.data && runDetail.data ? (
            <div className="flex flex-col gap-4">
              <Panel title="Pipeline steps" action={<Link href={`/app/reports/${report.data.id}`} className="text-sm text-info hover:underline">Open full report</Link>}>
                <Steps run={runDetail.data} />
              </Panel>
              <Panel>
                <ReportView report={report.data} />
              </Panel>
            </div>
          ) : (
            <Panel>
              <div className="max-w-[60ch]">
                <h2 className="font-serif text-xl">What you’ll get</h2>
                <p className="mt-2 text-base text-ink-2">
                  A research note with a summary, findings, bull and bear factors, risks, open questions and limitations. Each line carries a mark in the margin telling you whether it is observed data, a calculation, something a source reported, or the model’s own interpretation.
                </p>
                <p className="mt-3 text-base text-ink-2">Claims the analyst attributes to a source are checked against the stored text of that source. If the quoted passage isn’t there, the claim is marked unverified.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

export default function AnalystPage() {
  return (
    <Suspense>
      <Analyst />
    </Suspense>
  );
}
