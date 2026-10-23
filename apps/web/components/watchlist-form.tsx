'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, Textarea } from '@/components/ui/primitives';

export function WatchlistForm({ open, onOpenChange, initial, onSubmit, pending, submitLabel }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: { name: string; description: string }; onSubmit: (v: { name: string; description: string }) => void; pending: boolean; submitLabel: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={submitLabel}
      footer={
        <Button variant="primary" disabled={!name.trim()} disabledReason="Give the watchlist a name" loading={pending} onClick={() => onSubmit({ name: name.trim(), description: description.trim() })}>
          {submitLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="wl-name">
          <Input id="wl-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Semiconductors" />
        </Field>
        <Field label="Description" htmlFor="wl-desc" hint="Optional. What ties these companies together?">
          <Textarea id="wl-desc" maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
