'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkCheck, GitCompareArrows } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Paged, Report } from '@/lib/types';
import { ClaimRow } from '@/components/research-note';
import { Badge, DataTable } from '@/components/ui/data';
import { Button, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';

type Row = Pick<Report, 'id' | 'title' | 'kind' | 'symbols' | 'generatedAt' | 'executiveSummary' | 'evidenceStrength' | 'saved' | 'citationStats'>;
const KIND_LABEL = { research: 'Research', daily_brief: 'Daily brief', weekly_digest: 'Weekly digest' } as const;

function Compare({ a, b }: { a: string; b: string }) {
  const ra = useQuery({ queryKey: ['report', a], queryFn: () => api.get<Report>(`/reports/${a}`) });
  const rb = useQuery({ queryKey: ['report', b], queryFn: () => api.get<Report>(`/reports/${b}`) });
  if (ra.isLoading || rb.isLoading) return <SkeletonRows rows={6} label="Loading comparison" />;
  if (ra.isError || rb.isError) return <ErrorState error={ra.error ?? rb.error} />;
  const [older, newer] = [ra.data!, rb.data!].sort((x, y) => Date.parse(x.generatedAt) - Date.parse(y.generatedAt));
  const added = newer!.symbols.filter((s) => !older!.symbols.includes(s));
  const dropped = older!.symbols.filter((s) => !newer!.symbols.includes(s));
  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        Comparing {dateTime(older!.generatedAt)} with {dateTime(newer!.generatedAt)}.
        {added.length ? ` Added: ${added.join(', ')}.` : ''}
        {dropped.length ? ` No longer covered: ${dropped.join(', ')}.` : ''}
        {` Evidence went from ${older!.evidenceStrength} to ${newer!.evidenceStrength}.`}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[older!, newer!].map((r) => (
          <div key={r.id} className="min-w-0 border-t border-line pt-4">
            <p className="text-sm text-ink-3">{dateTime(r.generatedAt)}</p>
            <Link href={`/app/reports/${r.id}`} className="font-serif text-xl hover:underline">
              {r.title}
            </Link>
            <p className="note-prose mt-2 !text-base">{r.executiveSummary}</p>
            <h4 className="mt-4 text-sm font-medium text-ink-2">Key findings</h4>
            <ol>
              {r.keyFindings.map((c, i) => (
                <ClaimRow key={i} claim={c} sources={r.sourceReferences} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [kind, setKind] = useState('');
  const [saved, setSaved] = useState(false);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState<[string, string] | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (submitted) params.set('q', submitted);
  if (kind) params.set('kind', kind);
  if (saved) params.set('saved', 'true');
  const q = useQuery({ queryKey: ['reports', params.toString()], queryFn: () => api.get<Paged<Row>>(`/reports?${params}`) });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id]));

  return (
    <>
      <PageHeader title="Reports" description="Every research note, daily brief and weekly digest you’ve generated. Select two to compare them." />
      <Panel id="reports">
        <form
          className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmitted(search.trim());
          }}
        >
          <Field label="Search reports" htmlFor="rs-q">
            <Input id="rs-q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Words in the title, question or summary" />
          </Field>
          <Field label="Type" htmlFor="rs-k">
            <Select id="rs-k" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              <option value="research">Research</option>
              <option value="daily_brief">Daily briefs</option>
              <option value="weekly_digest">Weekly digests</option>
            </Select>
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="size-4 accent-[var(--color-signal)]" checked={saved} onChange={(e) => { setSaved(e.target.checked); setPage(1); }} /> Saved only
          </label>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" disabled={picked.length !== 2} disabledReason="Select exactly two reports" onClick={() => setComparing([picked[0]!, picked[1]!])}>
            <GitCompareArrows className="size-3.5" aria-hidden /> Compare selected
          </Button>
          <span className="text-sm text-ink-3">{picked.length} of 2 selected</span>
        </div>

        {q.isLoading ? (
          <SkeletonRows rows={6} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data!.items.length ? (
          <EmptyState title={submitted || kind || saved ? 'No reports match these filters' : 'No reports yet'} action={<Link href="/app/analyst" className="text-sm text-info hover:underline">Ask the AI analyst</Link>}>
            {submitted || kind || saved ? 'Clear a filter or try different words.' : 'Reports appear here when you run research or when a scheduled brief completes.'}
          </EmptyState>
        ) : (
          <>
            <DataTable caption="Reports" head={[{ label: <span className="sr-only">Select for comparison</span> }, { label: 'Report' }, { label: 'Type' }, { label: 'Symbols' }, { label: 'Generated' }, { label: 'Sourced claims verified', align: 'right' }]}>
              {q.data!.items.map((r) => (
                <tr key={r.id}>
                  <td className="w-8">
                    <input type="checkbox" className="size-4 accent-[var(--color-signal)]" aria-label={`Select ${r.title} for comparison`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="max-w-[28rem]">
                    <Link href={`/app/reports/${r.id}`} className="line-clamp-1 text-ink hover:text-info hover:underline">
                      {r.saved && <BookmarkCheck className="mr-1 inline size-3.5 text-gold" aria-label="Saved" />}
                      {r.title}
                    </Link>
                  </td>
                  <td>
                    <Badge>{KIND_LABEL[r.kind]}</Badge>
                  </td>
                  <td className="text-ink-2">{r.symbols.join(', ')}</td>
                  <td className="whitespace-nowrap text-ink-3">{dateTime(r.generatedAt)}</td>
                  <td className="num text-right text-ink-2">
                    {r.citationStats?.verified ?? 0}/{(r.citationStats?.verified ?? 0) + (r.citationStats?.downgraded ?? 0)}
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
              <span>
                Page {q.data!.page} of {Math.max(1, Math.ceil(q.data!.total / q.data!.pageSize))}, {q.data!.total} reports
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="ghost" disabled={page * q.data!.pageSize >= q.data!.total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
      {comparing && (
        <Panel id="compare" title="Comparison" className="mt-4" action={<Button size="sm" variant="ghost" onClick={() => setComparing(null)}>Close comparison</Button>}>
          <Compare a={comparing[0]} b={comparing[1]} />
        </Panel>
      )}
    </>
  );
}
