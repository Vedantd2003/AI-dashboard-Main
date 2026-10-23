'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeSymbol } from '@alphapulse/shared';
import { api } from '@/lib/api';
import { dateTime, num, relative } from '@/lib/format';
import { useApiMutation, useMe } from '@/lib/hooks';
import type { Alert, AppNotification, Delivery, Paged } from '@/lib/types';
import { Badge, DataTable } from '@/components/ui/data';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';

const ruleText = (a: Pick<Alert, 'type' | 'threshold'>) =>
  a.type === 'pct_move' ? `Daily move of ±${num(a.threshold, 1)}% or more` : a.type === 'price_above' ? `Price at or above ${num(a.threshold)}` : `Price at or below ${num(a.threshold)}`;

function CreateAlert({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe();
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<Alert['type']>('price_above');
  const [threshold, setThreshold] = useState('');
  const [cooldown, setCooldown] = useState(1440);
  const [email, setEmail] = useState(false);
  const [webhook, setWebhook] = useState(false);
  const create = useApiMutation(
    () => api.post('/alerts', { symbol: normalizeSymbol(symbol), type, threshold: Number(threshold), cooldownMinutes: cooldown, channels: ['in_app', ...(email ? ['email'] : []), ...(webhook ? ['webhook'] : [])] }),
    { success: 'Alert created', invalidate: [['alerts']], onSuccess: () => onOpenChange(false) },
  );
  const valid = !!normalizeSymbol(symbol) && Number(threshold) > 0 && (type !== 'pct_move' || Number(threshold) <= 100);
  const prefs = me.data?.notificationPrefs;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New alert"
      description="The watchlist monitor checks alerts against delayed quotes. An alert fires at most once per quiet period."
      footer={
        <Button variant="primary" disabled={!valid} disabledReason="Enter a symbol and a positive threshold" loading={create.isPending} onClick={() => create.mutate()}>
          Create alert
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Symbol" htmlFor="al-s">
          <Input id="al-s" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" />
        </Field>
        <Field label="Condition" htmlFor="al-t">
          <Select id="al-t" value={type} onChange={(e) => setType(e.target.value as Alert['type'])}>
            <option value="price_above">Price rises to or above</option>
            <option value="price_below">Price falls to or below</option>
            <option value="pct_move">Daily move of at least (±%)</option>
          </Select>
        </Field>
        <Field label={type === 'pct_move' ? 'Percent' : 'Price'} htmlFor="al-th" hint={type === 'pct_move' ? 'Compared with the previous close.' : 'In the listing currency.'}>
          <Input id="al-th" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <Field label="Quiet period after firing" htmlFor="al-cd">
          <Select id="al-cd" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}>
            <option value={60}>1 hour</option>
            <option value={240}>4 hours</option>
            <option value={1440}>1 day</option>
            <option value={10080}>1 week</option>
          </Select>
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink-2">Also notify by</legend>
        <Checkbox id="al-e" label="Email" description={prefs?.email ? undefined : 'Turn on email notifications in Settings first.'} checked={email} disabled={!prefs?.email} onChange={setEmail} />
        <Checkbox id="al-w" label="Slack or Discord webhook" description={prefs?.webhook && prefs.webhookUrl ? undefined : 'Add a webhook URL in Settings first.'} checked={webhook} disabled={!(prefs?.webhook && prefs.webhookUrl)} onChange={setWebhook} />
      </fieldset>
    </Dialog>
  );
}

function DeliveryChips({ deliveries }: { deliveries: Delivery[] }) {
  const tone = { delivered: 'up', failed: 'down', skipped: 'neutral', pending: 'warn' } as const;
  const name = { in_app: 'In app', email: 'Email', webhook: 'Webhook' } as const;
  return (
    <span className="flex flex-wrap gap-1">
      {deliveries.map((d) => (
        <Badge key={d.channel} tone={tone[d.status]} title={d.error ?? undefined}>
          {name[d.channel]}: {d.status}
        </Badge>
      ))}
    </span>
  );
}

export default function AlertsPage() {
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<{ items: Alert[] }>('/alerts') });
  const [unread, setUnread] = useState(false);
  const notes = useQuery({ queryKey: ['notifications', unread], queryFn: () => api.get<Paged<AppNotification> & { unreadCount: number }>(`/notifications?pageSize=30${unread ? '&unread=true' : ''}`) });
  const [open, setOpen] = useState(false);
  const toggle = useApiMutation((a: Alert) => api.patch(`/alerts/${a.id}`, { active: !a.active }), { success: 'Alert updated', invalidate: [['alerts']] });
  const del = useApiMutation((id: string) => api.del(`/alerts/${id}`), { success: 'Alert deleted', invalidate: [['alerts']] });
  const evaluate = useApiMutation(() => api.post<{ evaluated: number; triggered: number; suppressedByCooldown: number; quoteErrors: number }>('/alerts/evaluate'), {
    success: (r) => `Checked ${r.evaluated} alerts: ${r.triggered} fired, ${r.suppressedByCooldown} in quiet period${r.quoteErrors ? `, ${r.quoteErrors} without a quote` : ''}`,
    invalidate: [['alerts'], ['notifications']],
  });
  const read = useApiMutation((id: string) => api.post(`/notifications/${id}/read`), { invalidate: [['notifications']] });
  const readAll = useApiMutation(() => api.post('/notifications/read-all'), { success: 'All notifications marked read', invalidate: [['notifications']] });
  const test = useApiMutation(() => api.post<{ deliveries: Delivery[] }>('/notifications/test'), {
    success: (r) => `Test sent: ${r.deliveries.map((d) => `${d.channel.replace('_', '-')} ${d.status}`).join(', ')}`,
    invalidate: [['notifications']],
  });

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Price and movement rules for the companies you follow, and every notification AlphaPulse has sent you."
        actions={
          <>
            <Button size="sm" variant="secondary" loading={evaluate.isPending} disabled={!alerts.data?.items.some((a) => a.active)} disabledReason="No active alerts to check" onClick={() => evaluate.mutate()}>
              Check alerts now
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              <Plus className="size-3.5" aria-hidden /> New alert
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Panel id="rules" title="Alert rules">
          {alerts.isLoading ? (
            <SkeletonRows rows={4} />
          ) : alerts.isError ? (
            <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
          ) : !alerts.data!.items.length ? (
            <EmptyState title="No alerts yet" action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>Create an alert</Button>}>
              For example: notify me if NVDA moves more than 5% in a day.
            </EmptyState>
          ) : (
            <DataTable caption="Alert rules" head={[{ label: 'Symbol' }, { label: 'Rule' }, { label: 'Channels' }, { label: 'Last check' }, { label: 'Status' }, { label: <span className="sr-only">Actions</span>, align: 'right' }]}>
              {alerts.data!.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/app/markets/${encodeURIComponent(a.symbol)}`} className="font-medium hover:text-info hover:underline">
                      {a.symbol}
                    </Link>
                  </td>
                  <td className="text-ink-2">{ruleText(a)}</td>
                  <td className="text-ink-3">{a.channels.map((c) => (c === 'in_app' ? 'In app' : c === 'email' ? 'Email' : 'Webhook')).join(', ')}</td>
                  <td className="max-w-64 text-ink-3">
                    {a.lastEvaluatedAt ? (
                      <>
                        {relative(a.lastEvaluatedAt)}
                        <span className="block truncate text-caption" title={a.lastEvaluation ?? undefined}>
                          {a.lastEvaluation}
                        </span>
                      </>
                    ) : (
                      'Not checked yet'
                    )}
                  </td>
                  <td>
                    <button onClick={() => toggle.mutate(a)} className="text-sm" aria-label={`${a.active ? 'Pause' : 'Resume'} alert for ${a.symbol}`}>
                      <Badge tone={a.active ? 'up' : 'neutral'}>{a.active ? 'Active' : 'Paused'}</Badge>
                    </button>
                    {a.lastTriggeredAt && <span className="block text-caption text-ink-3">Fired {relative(a.lastTriggeredAt)}</span>}
                  </td>
                  <td className="text-right">
                    <ConfirmDialog
                      title={`Delete alert for ${a.symbol}?`}
                      description={ruleText(a)}
                      confirmLabel="Delete alert"
                      onConfirm={() => del.mutateAsync(a.id)}
                      trigger={(o) => (
                        <button onClick={o} className="rounded p-1.5 text-ink-3 hover:bg-surface-3 hover:text-down" aria-label={`Delete alert for ${a.symbol}`}>
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

        <Panel
          id="notifications"
          title={`Notifications${notes.data?.unreadCount ? ` (${notes.data.unreadCount} unread)` : ''}`}
          action={
            <>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" className="size-4 accent-[var(--color-signal)]" checked={unread} onChange={(e) => setUnread(e.target.checked)} /> Unread only
              </label>
              <Button size="sm" variant="ghost" loading={test.isPending} onClick={() => test.mutate()}>
                Send test
              </Button>
              <Button size="sm" variant="ghost" disabled={!notes.data?.unreadCount} onClick={() => readAll.mutate()}>
                Mark all read
              </Button>
            </>
          }
        >
          {notes.isLoading ? (
            <SkeletonRows rows={5} />
          ) : notes.isError ? (
            <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
          ) : !notes.data!.items.length ? (
            <EmptyState title={unread ? 'Nothing unread' : 'No notifications yet'}>Triggered alerts, finished briefs and workflow problems show up here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line/60">
              {notes.data!.items.map((n) => (
                <li key={n.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className={`text-base ${n.readAt ? 'text-ink-2' : 'font-medium text-ink'}`}>
                      {!n.readAt && <span aria-label="Unread" className="mr-2 inline-block size-1.5 rounded-full bg-gold align-middle" />}
                      {n.link ? (
                        <Link href={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className="hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">{n.body}</p>}
                    <div className="mt-1.5">
                      <DeliveryChips deliveries={n.deliveries} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-caption text-ink-3" title={dateTime(n.createdAt)}>
                      {relative(n.createdAt)}
                    </span>
                    {!n.readAt && (
                      <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-caption text-ink-3">Delivery status is recorded per channel. “Skipped” means the channel is off or not configured; “delivered” is shown only after the provider accepted the message.</p>
        </Panel>
      </div>
      {open && <CreateAlert open={open} onOpenChange={setOpen} />}
    </>
  );
}
