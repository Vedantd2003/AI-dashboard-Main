'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, Copy, Link2, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/hooks';
import type { Report } from '@/lib/types';
import { ReportView, reportPlainText } from '@/components/report-view';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Button, SkeletonRows } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.get<Report>(`/reports/${id}`) });
  const save = useApiMutation((saved: boolean) => api.patch(`/reports/${id}`, { saved }), { success: (r) => ((r as { saved: boolean }).saved ? 'Report saved' : 'Removed from saved'), invalidate: [['report', id], ['reports']] });
  const share = useApiMutation((enabled: boolean) => api.post<{ shareToken: string | null; path: string | null }>(`/reports/${id}/share`, { enabled }), {
    invalidate: [['report', id]],
    onSuccess: async (r) => {
      if (r.path) {
        const url = `${window.location.origin}${r.path}`;
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        toast.success('Share link copied', { description: 'Anyone with the link can read this report until you turn sharing off.' });
      } else toast.success('Sharing turned off');
    },
  });
  const del = useApiMutation(() => api.del(`/reports/${id}`), { success: 'Report deleted', invalidate: [['reports']], onSuccess: () => router.replace('/app/reports') });

  if (q.isLoading) return <SkeletonRows rows={10} label="Loading report" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!;

  return (
    <ReportView
      report={r}
      toolbar={
        <>
          <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate(!r.saved)}>
            {r.saved ? <BookmarkCheck className="size-3.5 text-gold" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
            {r.saved ? 'Saved' : 'Save report'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(reportPlainText(r));
              toast.success('Summary copied');
            }}
          >
            <Copy className="size-3.5" aria-hidden /> Copy summary
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()} title="Opens the print dialog; choose “Save as PDF”">
            <Printer className="size-3.5" aria-hidden /> Export PDF
          </Button>
          <Button size="sm" variant="secondary" loading={share.isPending} onClick={() => share.mutate(!r.shareToken)}>
            <Link2 className="size-3.5" aria-hidden /> {r.shareToken ? 'Stop sharing' : 'Copy share link'}
          </Button>
          <ConfirmDialog
            title="Delete this report?"
            description="The report and its source references are removed. Source documents stay in your library."
            confirmLabel="Delete report"
            onConfirm={() => del.mutateAsync()}
            trigger={(open) => (
              <Button size="sm" variant="ghost" onClick={open}>
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </Button>
            )}
          />
        </>
      }
    />
  );
}
