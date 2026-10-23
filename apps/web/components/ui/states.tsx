'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, PlugZap, RotateCcw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from './primitives';

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div>
        <p className="text-base font-medium text-ink">{title}</p>
        {children && <div className="mt-1 max-w-[60ch] text-sm text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Distinguishes "not configured" (a setup task) from real failures (retryable). */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.notConfigured) return <NotConfigured message={e.message} hint={e.hint} compact={compact} />;
  const message = e?.message ?? (error instanceof Error ? error.message : 'Something went wrong.');
  return (
    <div role="alert" className={compact ? 'flex items-start gap-2 text-sm text-down' : 'flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-down/40 bg-down/5 px-4 py-4'}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-down" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink">{e?.status === 429 ? 'Rate limit reached' : 'Could not load this'}</p>
          <p className="text-sm text-ink-2">{message}</p>
        </div>
      </div>
      {onRetry && !compact && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RotateCcw className="size-3.5" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function NotConfigured({ message, hint, compact }: { message: string; hint?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'flex items-start gap-2 text-sm' : 'flex items-start gap-3 rounded-[var(--radius-panel)] border border-warn/40 bg-warn/5 px-4 py-4'}>
      <PlugZap className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">{message}</p>
        {hint && <p className="text-sm text-ink-2">{hint}</p>}
      </div>
    </div>
  );
}
