'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileUp, Rss, Trash2 } from 'lucide-react';
import { normalizeSymbols } from '@alphapulse/shared';
import { api } from '@/lib/api';
import { dateShort, dateTime, relative } from '@/lib/format';
import { useApiMutation } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { Badge, DataTable, StatusDot } from '@/components/ui/data';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';

interface Doc {
  id: string;
  ownerId: string | null;
  kind: 'news' | 'filing' | 'rss' | 'upload';
  origin: string;
  provider: string;
  url: string | null;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  symbols: string[];
  extraction: { status: 'ok' | 'partial' | 'failed'; error: string | null; pages: number | null };
}
interface Run {
  id: string;
  status: string;
  request: { question: string; symbols: string[] };
  reportId: string | null;
  createdAt: string;
  error: string | null;
}

const KIND = { news: 'News', filing: 'SEC filing', rss: 'Feed item', upload: 'Your upload' } as const;

function DocViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['doc', id], queryFn: () => api.get<Doc & { text: string; truncated: boolean }>(`/research/documents/${id}`) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={q.data?.title ?? 'Source'} description={q.data ? `${KIND[q.data.kind]} via ${q.data.provider}. Stored text used for citation checks.` : undefined}>
      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="max-h-[55vh] overflow-y-auto">
          <pre className="font-sans text-sm whitespace-pre-wrap text-ink-2">{q.data!.text || 'No text was extracted from this document.'}</pre>
          {q.data!.truncated && <p className="mt-3 text-caption text-ink-3">Showing the first 50,000 characters.</p>}
        </div>
      )}
    </Dialog>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [symbols, setSymbols] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const up = useApiMutation(
    () => {
      const f = new FormData();
      f.append('file', picked!);
      f.append('symbols', normalizeSymbols(symbols.split(/[\s,]+/).filter(Boolean)).valid.join(','));
      return api.upload<{ title: string; extraction: { status: string; error: string | null }; chars: number }>('/research/documents/upload', f);
    },
    {
      success: (r) => (r.extraction.status === 'ok' ? `Uploaded ${r.title}` : `Uploaded ${r.title}, but ${r.extraction.error ?? 'text extraction was incomplete'}`),
      invalidate: [['documents']],
      onSuccess: () => {
        setPicked(null);
        onOpenChange(false);
      },
    },
  );
  const tooBig = picked && picked.size > 10 * 1024 * 1024;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a research document"
      description="PDF, TXT or Markdown up to 10 MB. The text is stored privately and can be cited in your research. Instructions inside documents are ignored."
      footer={
        <Button variant="primary" disabled={!picked || !!tooBig} disabledReason={tooBig ? 'Files are limited to 10 MB' : 'Choose a file'} loading={up.isPending} onClick={() => up.mutate()}>
          Upload document
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="File" htmlFor="up-f" error={tooBig ? 'Files are limited to 10 MB' : undefined}>
          <input ref={file} id="up-f" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => setPicked(e.target.files?.[0] ?? null)} className="text-sm text-ink-2 file:mr-3 file:rounded file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-ink" />
        </Field>
        <Field label="Related symbols" htmlFor="up-s" hint="Optional. Helps the analyst find this document.">
          <Input id="up-s" value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="AAPL" />
        </Field>
      </div>
    </Dialog>
  );
}

function FeedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [symbols, setSymbols] = useState('');
  const imp = useApiMutation(() => api.post<{ feedTitle: string; imported: number }>('/research/documents/rss', { url: url.trim(), symbols: normalizeSymbols(symbols.split(/[\s,]+/).filter(Boolean)).valid }), {
    success: (r) => `Imported ${r.imported} items from ${r.feedTitle || 'the feed'}`,
    invalidate: [['documents']],
    onSuccess: () => onOpenChange(false),
  });
  const valid = /^https?:\/\/\S+$/.test(url.trim());
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import an RSS or Atom feed"
      description="Use a company investor-relations or publisher feed you’re permitted to read. AlphaPulse fetches it once now; private network addresses are blocked."
      footer={
        <Button variant="primary" disabled={!valid} disabledReason="Enter a full http(s) URL" loading={imp.isPending} onClick={() => imp.mutate()}>
          Import feed
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Feed URL" htmlFor="fd-u">
          <Input id="fd-u" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://investor.example.com/rss/news" />
        </Field>
        <Field label="Tag items with symbols" htmlFor="fd-s" hint="Optional.">
          <Input id="fd-s" value={symbols} onChange={(e) => setSymbols(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function ResearchPage() {
  const [kind, setKind] = useState('');
  const [symbol, setSymbol] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const [feed, setFeed] = useState(false);
  const p = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (kind) p.set('kind', kind);
  const sym = normalizeSymbols([symbol]).valid[0];
  if (sym) p.set('symbol', sym);
  if (mine) p.set('mine', 'true');
  const docs = useQuery({ queryKey: ['documents', p.toString()], queryFn: () => api.get<Paged<Doc>>(`/research/documents?${p}`) });
  const runs = useQuery({ queryKey: ['runs', 'list'], queryFn: () => api.get<Paged<Run>>('/research/runs?pageSize=10') });
  const del = useApiMutation((id: string) => api.del(`/research/documents/${id}`), { success: 'Document deleted', invalidate: [['documents']] });

  return (
    <>
      <PageHeader
        title="Research"
        description="The source library behind your reports: news, SEC filings, feed items and your own documents, each with where it came from and when it was retrieved."
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setFeed(true)}>
              <Rss className="size-3.5" aria-hidden /> Import feed
            </Button>
            <Button size="sm" variant="primary" onClick={() => setUpload(true)}>
              <FileUp className="size-3.5" aria-hidden /> Upload document
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel id="library" title="Source library">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[180px_160px_auto] sm:items-end">
            <Field label="Type" htmlFor="lib-k">
              <Select id="lib-k" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
                <option value="">All types</option>
                <option value="news">News</option>
                <option value="filing">SEC filings</option>
                <option value="rss">Feed items</option>
                <option value="upload">Uploads</option>
              </Select>
            </Field>
            <Field label="Symbol" htmlFor="lib-s">
              <Input id="lib-s" value={symbol} onChange={(e) => { setSymbol(e.target.value); setPage(1); }} placeholder="Any" />
            </Field>
            <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="size-4 accent-[var(--color-signal)]" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Only my uploads and feeds
            </label>
          </div>
          {docs.isLoading ? (
            <SkeletonRows rows={8} />
          ) : docs.isError ? (
            <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
          ) : !docs.data!.items.length ? (
            <EmptyState title="No sources yet">Sources are collected when you run research or open a company page, or when you upload a document or import a feed.</EmptyState>
          ) : (
            <>
              <DataTable caption="Source documents" head={[{ label: 'Title' }, { label: 'Type' }, { label: 'Symbols' }, { label: 'Published' }, { label: 'Text' }, { label: <span className="sr-only">Actions</span>, align: 'right' }]}>
                {docs.data!.items.map((d) => (
                  <tr key={d.id}>
                    <td className="max-w-[26rem]">
                      <button onClick={() => setViewing(d.id)} className="line-clamp-1 text-left text-ink hover:text-info hover:underline">
                        {d.title}
                      </button>
                      <span className="block text-caption text-ink-3">
                        {d.publisher ?? d.provider}
                        {d.url && (
                          <>
                            {', '}
                            <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="text-info hover:underline">
                              original
                            </a>
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <Badge tone={d.kind === 'filing' ? 'gold' : d.kind === 'upload' ? 'signal' : 'neutral'}>{KIND[d.kind]}</Badge>
                    </td>
                    <td className="text-ink-2">{d.symbols.join(', ') || '—'}</td>
                    <td className="whitespace-nowrap text-ink-3">{d.publishedAt ? dateShort(d.publishedAt) : `Retrieved ${relative(d.retrievedAt)}`}</td>
                    <td title={d.extraction.error ?? undefined}>
                      <StatusDot status={d.extraction.status === 'ok' ? 'ok' : d.extraction.status === 'partial' ? 'degraded' : 'failed'} />
                    </td>
                    <td className="text-right">
                      {d.ownerId && (
                        <ConfirmDialog
                          title="Delete this document?"
                          description="Reports that cited it keep their reference, but its text can no longer be viewed."
                          confirmLabel="Delete document"
                          onConfirm={() => del.mutateAsync(d.id)}
                          trigger={(open) => (
                            <button onClick={open} className="rounded p-1.5 text-ink-3 hover:bg-surface-3 hover:text-down" aria-label={`Delete ${d.title}`}>
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
                <span>{docs.data!.total} documents</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="ghost" disabled={page * docs.data!.pageSize >= docs.data!.total} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-caption text-ink-3">Text status shows whether AlphaPulse could extract citable text. News items store the provider’s headline and summary, not the full article.</p>
            </>
          )}
        </Panel>

        <Panel id="runs" title="Recent research runs" className="xl:self-start">
          {runs.isLoading ? (
            <SkeletonRows rows={5} />
          ) : runs.isError ? (
            <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
          ) : !runs.data!.items.length ? (
            <EmptyState title="No runs yet" action={<Link href="/app/analyst" className="text-sm text-info hover:underline">Ask the AI analyst</Link>} />
          ) : (
            <ul className="divide-y divide-line/60">
              {runs.data!.items.map((r) => (
                <li key={r.id} className="py-2.5">
                  {r.reportId ? (
                    <Link href={`/app/reports/${r.reportId}`} className="line-clamp-2 text-sm text-ink hover:underline">
                      {r.request.question}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 text-sm text-ink">{r.request.question}</p>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <StatusDot status={r.status} />
                    <span className="text-caption text-ink-3">{dateTime(r.createdAt)}</span>
                  </div>
                  {r.error && <p className="mt-1 line-clamp-2 text-caption text-down">{r.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {viewing && <DocViewer id={viewing} onClose={() => setViewing(null)} />}
      <UploadDialog open={upload} onOpenChange={setUpload} />
      <FeedDialog open={feed} onOpenChange={setFeed} />
    </>
  );
}
