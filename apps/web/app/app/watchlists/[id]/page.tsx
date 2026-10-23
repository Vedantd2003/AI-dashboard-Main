'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Pencil, Trash2 } from 'lucide-react';
import { normalizeSymbol } from '@alphapulse/shared';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useApiMutation } from '@/lib/hooks';
import type { History, Watchlist, WatchlistItem } from '@/lib/types';
import { Sparkline } from '@/components/charts';
import { DataTable, Delta, FreshnessBadge } from '@/components/ui/data';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, PageHeader, Panel, SkeletonRows, Textarea } from '@/components/ui/primitives';
import { EmptyState, ErrorState, NotConfigured } from '@/components/ui/states';
import { WatchlistForm } from '@/components/watchlist-form';

function RowSpark({ symbol }: { symbol: string }) {
  const q = useQuery({ queryKey: ['history', symbol, '1M'], queryFn: () => api.get<History>(`/markets/${encodeURIComponent(symbol)}/history?range=1M`), staleTime: 15 * 60_000 });
  if (!q.data) return <span className="text-caption text-ink-3">{q.isError ? 'No history' : ''}</span>;
  return <Sparkline values={q.data.bars.map((b) => b.close)} label={`${symbol} one-month trend`} />;
}

function NoteEditor({ wl, item, onClose }: { wl: string; item: WatchlistItem; onClose: () => void }) {
  const [note, setNote] = useState(item.note);
  const save = useApiMutation(() => api.patch(`/watchlists/${wl}/items/${encodeURIComponent(item.symbol)}`, { note }), { success: 'Note saved', invalidate: [['watchlist', wl]], onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Note on ${item.symbol}`}
      description="Private to you. Your thesis, what would change your mind, dates to watch."
      footer={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save note
        </Button>
      }
    >
      <Field label="Note" htmlFor="note">
        <Textarea id="note" rows={6} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export default function WatchlistDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['watchlist', id], queryFn: () => api.get<Watchlist>(`/watchlists/${id}`), refetchInterval: 120_000 });
  const [symbol, setSymbol] = useState('');
  const [editing, setEditing] = useState(false);
  const [noteFor, setNoteFor] = useState<WatchlistItem | null>(null);
  const inv = [['watchlist', id], ['watchlists']];
  const add = useApiMutation((s: string) => api.post(`/watchlists/${id}/items`, { symbol: s }), { success: 'Symbol added', invalidate: inv, onSuccess: () => setSymbol('') });
  const remove = useApiMutation((s: string) => api.del(`/watchlists/${id}/items/${encodeURIComponent(s)}`), { success: 'Symbol removed', invalidate: inv });
  const rename = useApiMutation((v: { name: string; description: string }) => api.patch(`/watchlists/${id}`, v), { success: 'Watchlist saved', invalidate: inv, onSuccess: () => setEditing(false) });
  const del = useApiMutation(() => api.del(`/watchlists/${id}`), { success: 'Watchlist deleted', invalidate: [['watchlists']], onSuccess: () => router.replace('/app/watchlists') });

  if (q.isLoading) return <SkeletonRows rows={8} label="Loading watchlist" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const wl = q.data!;
  const norm = normalizeSymbol(symbol);
  const firstQuote = wl.items.find((i) => i.quote)?.quote;

  return (
    <>
      <PageHeader
        title={wl.name}
        description={wl.description || undefined}
        actions={
          <>
            {wl.items.length > 0 && (
              <Link href={`/app/analyst?symbols=${wl.items.slice(0, 5).map((i) => i.symbol).join(',')}&task=company_update`} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3">
                <Bot className="size-3.5" aria-hidden /> Research this list
              </Link>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden /> Rename
            </Button>
            <ConfirmDialog
              title={`Delete ${wl.name}?`}
              description="The watchlist and alerts attached to it are removed. Saved reports are kept."
              confirmLabel="Delete watchlist"
              onConfirm={() => del.mutateAsync()}
              trigger={(open) => (
                <Button size="sm" variant="danger" onClick={open}>
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </Button>
              )}
            />
          </>
        }
      />
      <Panel
        id="symbols"
        title={`${wl.items.length} ${wl.items.length === 1 ? 'symbol' : 'symbols'}`}
        action={firstQuote ? <FreshnessBadge freshness={firstQuote.freshness} provider={firstQuote.provider} asOf={firstQuote.asOf} /> : null}
      >
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (norm) add.mutate(norm);
          }}
        >
          <Field label="Add a symbol" htmlFor="add-sym" className="sm:w-64" error={symbol && !norm ? 'That doesn’t look like a ticker symbol' : undefined}>
            <Input id="add-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" autoComplete="off" />
          </Field>
          <Button type="submit" variant="primary" disabled={!norm || wl.items.length >= 100} disabledReason={wl.items.length >= 100 ? 'A watchlist holds at most 100 symbols' : 'Enter a ticker symbol'} loading={add.isPending}>
            Add symbol
          </Button>
        </form>
        {!wl.marketDataConfigured && wl.items.length > 0 && (
          <div className="mb-4">
            <NotConfigured message="Prices aren’t available because market data is not configured." hint="Symbols and notes still work. Set TWELVE_DATA_API_KEY to see quotes." compact />
          </div>
        )}
        {!wl.items.length ? (
          <EmptyState title="This watchlist is empty">Add a ticker above. US listings are supported on the free market data plan.</EmptyState>
        ) : (
          <DataTable caption={`Symbols in ${wl.name}`} head={[{ label: 'Symbol' }, { label: 'Last', align: 'right' }, { label: 'Day', align: 'right' }, { label: '1 month' }, { label: 'Note' }, { label: <span className="sr-only">Actions</span>, align: 'right' }]}>
            {wl.items.map((i) => (
              <tr key={i.symbol}>
                <td>
                  <Link href={`/app/markets/${encodeURIComponent(i.symbol)}`} className="font-medium hover:text-info hover:underline">
                    {i.symbol}
                  </Link>
                  {i.quote?.name && <span className="block max-w-48 truncate text-caption text-ink-3">{i.quote.name}</span>}
                </td>
                <td className="num text-right">{i.quote ? money(i.quote.price, i.quote.currency ?? 'USD') : <span className="text-caption text-ink-3">{i.quoteError ?? '—'}</span>}</td>
                <td className="text-right">{i.quote ? <Delta value={i.quote.changePct} /> : '—'}</td>
                <td>{wl.marketDataConfigured ? <RowSpark symbol={i.symbol} /> : '—'}</td>
                <td className="max-w-64">
                  <button onClick={() => setNoteFor(i)} className="line-clamp-2 text-left text-sm text-ink-2 hover:text-ink">
                    {i.note || <span className="text-ink-3">Add a note</span>}
                  </button>
                </td>
                <td className="text-right">
                  <ConfirmDialog
                    title={`Remove ${i.symbol}?`}
                    description="Your note on this symbol is removed with it."
                    confirmLabel="Remove symbol"
                    onConfirm={() => remove.mutateAsync(i.symbol)}
                    trigger={(open) => (
                      <button onClick={open} className="rounded p-1.5 text-ink-3 hover:bg-surface-3 hover:text-down" aria-label={`Remove ${i.symbol}`}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {editing && <WatchlistForm open onOpenChange={setEditing} initial={{ name: wl.name, description: wl.description }} onSubmit={(v) => rename.mutate(v)} pending={rename.isPending} submitLabel="Save watchlist" />}
      {noteFor && <NoteEditor wl={id} item={noteFor} onClose={() => setNoteFor(null)} />}
    </>
  );
}
