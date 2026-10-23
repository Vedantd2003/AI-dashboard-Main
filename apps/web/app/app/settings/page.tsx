'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApiMutation, useMe } from '@/lib/hooks';
import type { Paged, User } from '@/lib/types';
import { Badge, DataTable } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, Field, Input, PageHeader, Panel, Select, SkeletonRows } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];

function Profile({ user }: { user: User }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [tz, setTz] = useState(user.timezone);
  const save = useApiMutation(() => api.patch('/me/settings', { name: name.trim(), timezone: tz }), { success: 'Profile saved', onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
  return (
    <Panel id="profile" title="Profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="st-n">
          <Input id="st-n" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="st-e" hint={user.emailVerified ? 'Verified' : 'Not verified'}>
          <Input id="st-e" value={user.email} disabled />
        </Field>
        <Field label="Time zone" htmlFor="st-tz" hint="Used to show times in reports and notifications.">
          <Select id="st-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {[...new Set([tz, ...TIMEZONES])].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Button className="mt-4" variant="primary" size="sm" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
        Save profile
      </Button>
    </Panel>
  );
}

function Notifications({ user }: { user: User }) {
  const qc = useQueryClient();
  const [p, setP] = useState(user.notificationPrefs);
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ integrations: Record<string, string> }>('/health') });
  const emailReady = health.data?.integrations.email === 'configured';
  const save = useApiMutation(() => api.patch('/me/settings', { notificationPrefs: { ...p, webhookUrl: p.webhook ? p.webhookUrl || null : p.webhookUrl || null } }), {
    success: 'Notification preferences saved',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const webhookInvalid = p.webhook && !/^https:\/\/\S+$/.test(p.webhookUrl ?? '');
  return (
    <Panel id="notify" title="Notifications">
      <div className="flex flex-col gap-1">
        <Checkbox id="np-app" label="In-app notifications" description="Always on. They appear under Alerts." checked disabled onChange={() => undefined} />
        <Checkbox id="np-email" label="Email" description={emailReady ? `Sent to ${user.email}. Each email includes an unsubscribe link.` : 'Email delivery is not configured on this deployment, so nothing will be sent.'} checked={p.email} onChange={(v) => setP({ ...p, email: v })} />
        <Checkbox id="np-wh" label="Slack or Discord webhook" checked={p.webhook} onChange={(v) => setP({ ...p, webhook: v })} />
        {p.webhook && (
          <Field label="Webhook URL" htmlFor="np-url" hint="An incoming-webhook URL from Slack or Discord. Treat it like a password." error={webhookInvalid ? 'Use a full https:// URL' : undefined} className="ml-7 max-w-lg">
            <Input id="np-url" type="url" value={p.webhookUrl ?? ''} onChange={(e) => setP({ ...p, webhookUrl: e.target.value })} />
          </Field>
        )}
        <div className="mt-3 border-t border-line pt-3">
          <Checkbox id="np-db" label="Daily brief" description="A cited brief for your watchlists on US trading days, when the daily brief workflow is enabled." checked={p.dailyBrief} onChange={(v) => setP({ ...p, dailyBrief: v })} />
          <Checkbox id="np-wd" label="Weekly digest" description="A summary of the week’s research, on Saturdays." checked={p.weeklyDigest} onChange={(v) => setP({ ...p, weeklyDigest: v })} />
        </div>
      </div>
      <Button className="mt-4" variant="primary" size="sm" disabled={webhookInvalid} disabledReason="Fix the webhook URL" loading={save.isPending} onClick={() => save.mutate()}>
        Save preferences
      </Button>
    </Panel>
  );
}

function Security() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const change = useApiMutation(() => api.post('/auth/password/change', { currentPassword: cur, newPassword: next }), {
    success: 'Password changed. Other sessions were signed out.',
    onSuccess: () => {
      setCur('');
      setNext('');
    },
  });
  const weak = next.length > 0 && !(next.length >= 10 && /[A-Za-z]/.test(next) && /\d/.test(next));
  return (
    <Panel id="security" title="Password">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="pw-c">
          <Input id="pw-c" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-n" hint="At least 10 characters, with letters and a number." error={weak ? 'Too weak' : undefined}>
          <Input id="pw-n" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      <Button className="mt-4" variant="primary" size="sm" disabled={!cur || !next || weak} disabledReason="Fill in both fields" loading={change.isPending} onClick={() => change.mutate()}>
        Change password
      </Button>
    </Panel>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const del = useApiMutation(() => api.del('/me', { password: pw }), {
    success: 'Account deleted',
    onSuccess: () => {
      qc.clear();
      router.replace('/');
    },
  });
  return (
    <Panel id="danger" title="Delete account">
      <p className="max-w-[62ch] text-sm text-ink-2">Permanently deletes your account, watchlists, portfolios, alerts, notifications, reports and uploaded documents. This can’t be undone.</p>
      <Button className="mt-4" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="Enter your password to confirm."
        footer={
          <Button variant="danger" disabled={!pw} loading={del.isPending} onClick={() => del.mutate()}>
            Delete account permanently
          </Button>
        }
      >
        <Field label="Password" htmlFor="del-pw">
          <Input id="del-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </Dialog>
    </Panel>
  );
}

function AdminUsers({ me }: { me: User }) {
  const q = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<Paged<User & { createdAt: string }>>('/admin/users?pageSize=50') });
  const role = useApiMutation((v: { id: string; role: 'user' | 'admin' }) => api.patch(`/admin/users/${v.id}/role`, { role: v.role }), { success: 'Role updated', invalidate: [['admin', 'users']] });
  return (
    <Panel id="admin" title="Users (administrator)">
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <DataTable caption="Users" head={[{ label: 'Name' }, { label: 'Email' }, { label: 'Joined' }, { label: 'Role' }, { label: <span className="sr-only">Actions</span>, align: 'right' }]}>
          {q.data!.items.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td className="text-ink-2">{u.email}</td>
              <td className="text-ink-3">{dateTime(u.createdAt)}</td>
              <td>
                <Badge tone={u.role === 'admin' ? 'gold' : 'neutral'}>{u.role === 'admin' ? 'Administrator' : 'User'}</Badge>
              </td>
              <td className="text-right">
                <Button size="sm" variant="ghost" disabled={u.id === me.id} disabledReason="You can’t change your own role here" onClick={() => role.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })}>
                  {u.role === 'admin' ? 'Make user' : 'Make administrator'}
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <p className="mt-3 text-caption text-ink-3">Changing a role signs that person out so the new permissions apply. Role changes are recorded in the audit log.</p>
    </Panel>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(!!me.data), [me.data]);
  if (!ready || !me.data) return <SkeletonRows rows={8} label="Loading settings" />;
  return (
    <>
      <PageHeader title="Settings" description="Your profile, how AlphaPulse reaches you, and account security." />
      <div className="flex max-w-4xl flex-col gap-4">
        <Profile user={me.data} />
        <Notifications user={me.data} />
        <Security />
        {me.data.role === 'admin' && <AdminUsers me={me.data} />}
        <DeleteAccount />
      </div>
    </>
  );
}
