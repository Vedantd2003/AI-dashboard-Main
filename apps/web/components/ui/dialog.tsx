'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './primitives';

export function Dialog({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_120ms_ease-out]" />
        <D.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-panel)] border border-line-strong bg-surface-1 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)] focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="font-serif text-xl text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <button className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-4" />
              </button>
            </D.Close>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation for destructive actions. The confirm button names the action. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, tone = 'danger' }: { trigger: (open: () => void) => ReactNode; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => Promise<unknown> | void; tone?: 'danger' | 'primary' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </>
  );
}
