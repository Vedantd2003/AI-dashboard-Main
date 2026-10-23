'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { useApiMutation } from '@/lib/hooks';
import type { Watchlist } from '@/lib/types';
import { Button, PageHeader, Panel, SkeletonRows } from '@/components/ui/primitives';
import { WatchlistForm } from '@/components/watchlist-form';
import { EmptyState, ErrorState } from '@/components/ui/states';

export default function WatchlistsPage() {
  const q = useQuery({ queryKey: ['watchlists'], queryFn: () => api.get<{ items: Watchlist[] }>('/watchlists') });
  const [open, setOpen] = useState(false);
  const create = useApiMutation((v: { name: string; description: string }) => api.post<Watchlist>('/watchlists', v), {
    success: (w) => `Created ${w.name}`,
    invalidate: [['watchlists']],
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <PageHeader
        title="Watchlists"
        description="Group the companies you follow. Each watchlist feeds your daily brief and alerts."
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> New watchlist
          </Button>
        }
      />
      {q.isLoading ? (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState title="No watchlists yet" action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>Create your first watchlist</Button>}>
          Start with five to ten companies you already follow. You can add notes to each one.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data!.items.map((w) => (
            <Link key={w.id} href={`/app/watchlists/${w.id}`} className="group rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 hover:border-line-strong">
              <h2 className="font-serif text-xl text-ink group-hover:underline">{w.name}</h2>
              {w.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{w.description}</p>}
              <p className="mt-3 text-sm text-ink-3">
                {w.items.length ? w.items.slice(0, 6).map((i) => i.symbol).join(', ') + (w.items.length > 6 ? ` and ${w.items.length - 6} more` : '') : 'No symbols yet'}
              </p>
              <p className="mt-1 text-caption text-ink-3">Updated {relative(w.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
      {open && <WatchlistForm open={open} onOpenChange={setOpen} onSubmit={(v) => create.mutate(v)} pending={create.isPending} submitLabel="Create watchlist" />}
    </>
  );
}
