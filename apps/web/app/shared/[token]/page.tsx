'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Report } from '@/lib/types';
import { Logo } from '@/components/logo';
import { ReportView } from '@/components/report-view';
import { SkeletonRows } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';

export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({ queryKey: ['shared', token], queryFn: () => api.get<Report>(`/reports/shared/${token}`), retry: false });
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 lg:px-8">
      <header className="no-print mb-8 flex items-center justify-between border-b border-line pb-4">
        <Link href="/" aria-label="AlphaPulse AI home">
          <Logo />
        </Link>
        <span className="text-sm text-ink-3">Shared research note</span>
      </header>
      <main id="main">{q.isLoading ? <SkeletonRows rows={10} /> : q.isError ? <ErrorState error={q.error} /> : <ReportView report={q.data!} />}</main>
    </div>
  );
}
