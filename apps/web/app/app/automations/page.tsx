'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, relative } from '@/lib/format';
import { useApiMutation, useMe } from '@/lib/hooks';
import type { Paged, WorkflowDef, WorkflowExecution } from '@/lib/types';
import { Badge, DataTable, StatusDot } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Button, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';

interface Runtime {
  scheduler: 'enabled' | 'disabled';
  queue: 'in_process' | 'bullmq';
  n8nWebhook: 'configured' | 'not_configured';
  n8nBaseUrl: string | null;
  marketCalendar: { trading: boolean; date: string; reason: string; calendarKnown: boolean };
}

const NAMES: Record<string, string> = { daily_brief: 'Daily market brief', watchlist_monitor: 'Watchlist event monitor', weekly_digest: 'Weekly research digest', source_health: 'Data source health monitor' };

function triggerText(w: WorkflowDef) {
  if (!w.enabled) return 'Disabled';
  if (w.trigger === 'manual') return 'Enabled for manual runs only';
  return `${w.trigger === 'n8n' ? 'Triggered by n8n' : 'Built-in scheduler'}: cron “${w.schedule}” in ${w.timezone}`;
}

function metricsText(m: Record<string, unknown>) {
  const parts = Object.entries(m)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
    .slice(0, 6)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`);
  return parts.join(', ');
}

function EditWorkflow({ w, runtime, onClose }: { w: WorkflowDef; runtime: Runtime; onClose: () => void }) {
  const [enabled, setEnabled] = useState(w.enabled);
  const [trigger, setTrigger] = useState(w.trigger);
  const [schedule, setSchedule] = useState(w.schedule);
  const [timezone, setTimezone] = useState(w.timezone);
  const save = useApiMutation(() => api.patch(`/automations/${w.key}`, { enabled, trigger, schedule, timezone }), { success: 'Workflow saved', invalidate: [['automations']], onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Configure ${w.name}`}
      description={w.description}
      footer={
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save workflow
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="wf-en">
          <Select id="wf-en" value={enabled ? 'on' : 'off'} onChange={(e) => setEnabled(e.target.value === 'on')}>
            <option value="on">Enabled</option>
            <option value="off">Disabled</option>
          </Select>
        </Field>
        <Field label="Triggered by" htmlFor="wf-tr" hint={trigger === 'scheduler' && runtime.scheduler === 'disabled' ? 'The built-in scheduler is off on this server (SCHEDULER_ENABLED).' : trigger === 'n8n' && runtime.n8nWebhook === 'not_configured' ? 'n8n is not configured (N8N_WEBHOOK_SECRET).' : undefined}>
          <Select id="wf-tr" value={trigger} onChange={(e) => setTrigger(e.target.value as WorkflowDef['trigger'])}>
            <option value="manual">Manual runs only</option>
            <option value="scheduler" disabled={runtime.scheduler === 'disabled'}>
              Built-in scheduler{runtime.scheduler === 'disabled' ? ' (unavailable)' : ''}
            </option>
            <option value="n8n" disabled={runtime.n8nWebhook === 'not_configured'}>
              n8n{runtime.n8nWebhook === 'not_configured' ? ' (not configured)' : ''}
            </option>
          </Select>
        </Field>
        <Field label="Schedule (cron)" htmlFor="wf-cr" hint="minute hour day month weekday">
          <Input id="wf-cr" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        </Field>
        <Field label="Time zone" htmlFor="wf-tz">
          <Input id="wf-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </Field>
      </div>
      {trigger === 'n8n' && <p className="mt-3 text-caption text-ink-3">n8n keeps its own schedule. Import the workflow from services/workflows and keep the cron there in sync with this one.</p>}
    </Dialog>
  );
}

export default function AutomationsPage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const defs = useQuery({ queryKey: ['automations'], queryFn: () => api.get<{ items: WorkflowDef[]; runtime: Runtime }>('/automations') });
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const execs = useQuery({
    queryKey: ['executions', filter, page],
    queryFn: () => api.get<Paged<WorkflowExecution>>(`/automations/executions?pageSize=15&page=${page}${filter ? `&key=${filter}` : ''}`),
    refetchInterval: 30_000,
  });
  const health = useQuery({ queryKey: ['automations', 'health'], queryFn: () => api.get<{ checks: { provider: string; status: string; checkedAt?: string; latencyMs?: number; detail?: string; stale?: boolean }[] }>('/automations/health') });
  const [editing, setEditing] = useState<WorkflowDef | null>(null);
  const run = useApiMutation((v: { key: string; rerunOf?: string }) => api.post<{ status: string; reason?: string; error?: string }>(`/automations/${v.key}/run`, v.rerunOf ? { rerunOf: v.rerunOf } : {}), {
    success: (r) => (r.status === 'skipped' ? `Run skipped: ${r.reason ?? 'nothing to do'}` : `Run ${r.status}`),
    invalidate: [['automations'], ['executions']],
  });
  const rt = defs.data?.runtime;

  return (
    <>
      <PageHeader title="Automations" description="Scheduled research pipelines. Each run is recorded with its trigger, attempts, duration and result. Runs are idempotent: a schedule that fires twice in the same window runs once." />

      {rt && (
        <dl className="mb-4 grid grid-cols-1 gap-3 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-ink-3">Built-in scheduler</dt>
            <dd className="mt-0.5">{rt.scheduler === 'enabled' ? 'On' : 'Off on this server'}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Job queue</dt>
            <dd className="mt-0.5">{rt.queue === 'bullmq' ? 'Redis (BullMQ)' : 'In-process (single instance)'}</dd>
          </div>
          <div>
            <dt className="text-ink-3">n8n</dt>
            <dd className="mt-0.5">{rt.n8nWebhook === 'configured' ? `Signed webhook ready${rt.n8nBaseUrl ? `, ${rt.n8nBaseUrl}` : ''}` : 'Not configured'}</dd>
          </div>
          <div>
            <dt className="text-ink-3">US market today ({rt.marketCalendar.date})</dt>
            <dd className="mt-0.5">
              {rt.marketCalendar.trading ? 'Trading day' : `Closed, ${rt.marketCalendar.reason}`}
              {!rt.marketCalendar.calendarKnown && <span className="block text-caption text-warn">Holiday table missing for this year</span>}
            </dd>
          </div>
        </dl>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel id="workflows" title="Workflows" className="lg:col-span-8">
          {defs.isLoading ? (
            <SkeletonRows rows={6} />
          ) : defs.isError ? (
            <ErrorState error={defs.error} onRetry={() => defs.refetch()} />
          ) : (
            <ul className="divide-y divide-line/60">
              {defs.data!.items.map((w) => (
                <li key={w.key} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-ink">{w.name}</p>
                    <p className="mt-0.5 max-w-[62ch] text-sm text-ink-2">{w.description}</p>
                    <p className="mt-1.5 text-caption text-ink-3">{triggerText(w)}</p>
                    {w.lastExecution && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-3">
                        <StatusDot status={w.lastExecution.status} /> last run {relative(w.lastExecution.startedAt)}
                        {w.lastExecution.error ? `: ${w.lastExecution.error}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled={!isAdmin} disabledReason="Only administrators can change workflows" onClick={() => setEditing(w)}>
                      Configure
                    </Button>
                    <Button size="sm" variant="primary" disabled={!isAdmin} disabledReason="Only administrators can run workflows" loading={run.isPending && run.variables?.key === w.key && !run.variables.rerunOf} onClick={() => run.mutate({ key: w.key })}>
                      <Play className="size-3.5" aria-hidden /> Run now
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!isAdmin && <p className="mt-2 text-caption text-ink-3">You can view workflow status. Running or changing workflows needs an administrator, because runs use paid data and model credits.</p>}
        </Panel>

        <Panel id="providers" title="Data sources" className="lg:col-span-4">
          {health.isLoading ? (
            <SkeletonRows rows={3} />
          ) : health.isError ? (
            <ErrorState error={health.error} onRetry={() => health.refetch()} />
          ) : (
            <ul className="divide-y divide-line/60">
              {health.data!.checks.map((c) => (
                <li key={c.provider} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base">{c.provider}</span>
                    <StatusDot status={c.status} />
                  </div>
                  <p className="text-caption text-ink-3">
                    {c.checkedAt ? `Checked ${relative(c.checkedAt)}` : 'Run the health monitor to check'}
                    {c.latencyMs ? `, ${c.latencyMs} ms` : ''}
                    {c.stale ? ', data is stale' : ''}
                    {c.detail && c.status !== 'ok' ? `. ${c.detail}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="history"
          title="Execution history"
          className="lg:col-span-12"
          action={
            <Select aria-label="Filter by workflow" className="!h-8 !w-56 text-sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
              <option value="">All workflows</option>
              {Object.entries(NAMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          }
        >
          {execs.isLoading ? (
            <SkeletonRows rows={6} />
          ) : execs.isError ? (
            <ErrorState error={execs.error} onRetry={() => execs.refetch()} />
          ) : !execs.data!.items.length ? (
            <EmptyState title="No runs recorded yet">Runs appear here from the scheduler, n8n, or the Run now button.</EmptyState>
          ) : (
            <>
              <DataTable caption="Workflow executions" head={[{ label: 'Workflow' }, { label: 'Started' }, { label: 'Trigger' }, { label: 'Result' }, { label: 'Duration', align: 'right' }, { label: 'Details' }, { label: <span className="sr-only">Actions</span>, align: 'right' }]}>
                {execs.data!.items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{NAMES[e.workflowKey] ?? e.workflowKey}</td>
                    <td className="whitespace-nowrap text-ink-3">{dateTime(e.startedAt)}</td>
                    <td>
                      <Badge>{e.trigger === 'n8n' ? 'n8n' : e.trigger === 'scheduler' ? 'Scheduler' : 'Manual'}</Badge>
                      {e.rerunOf && <span className="block text-caption text-ink-3">Rerun</span>}
                    </td>
                    <td>
                      <StatusDot status={e.status} />
                      {e.attempt > 1 && <span className="block text-caption text-ink-3">{e.attempt} attempts</span>}
                    </td>
                    <td className="num text-right text-ink-3">{e.durationMs !== undefined ? `${(e.durationMs / 1000).toFixed(1)} s` : '—'}</td>
                    <td className="max-w-[28rem] text-caption text-ink-3">{e.error ? <span className="text-down">{e.error}</span> : metricsText(e.metrics)}</td>
                    <td className="text-right">
                      {e.status === 'failed' && (
                        <Button size="sm" variant="ghost" disabled={!isAdmin} disabledReason="Only administrators can rerun workflows" onClick={() => run.mutate({ key: e.workflowKey, rerunOf: e.id })}>
                          <RotateCcw className="size-3.5" aria-hidden /> Rerun
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="ghost" disabled={page * execs.data!.pageSize >= execs.data!.total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
      {editing && rt && <EditWorkflow w={editing} runtime={rt} onClose={() => setEditing(null)} />}
    </>
  );
}
