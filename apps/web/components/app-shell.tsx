'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BookOpen, Bot, BriefcaseBusiness, ChartCandlestick, FileText, LayoutGrid, ListChecks, LogOut, Menu, Search, Settings, Siren, Workflow, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { useMe } from '@/lib/hooks';
import { Logo } from './logo';
import { Spinner } from './ui/primitives';

export const NAV = [
  { href: '/app', label: 'Overview', icon: LayoutGrid },
  { href: '/app/markets', label: 'Markets', icon: ChartCandlestick },
  { href: '/app/watchlists', label: 'Watchlists', icon: ListChecks },
  { href: '/app/research', label: 'Research', icon: BookOpen },
  { href: '/app/analyst', label: 'AI Analyst', icon: Bot },
  { href: '/app/portfolio', label: 'Portfolio Lab', icon: BriefcaseBusiness },
  { href: '/app/alerts', label: 'Alerts', icon: Siren },
  { href: '/app/automations', label: 'Automations', icon: Workflow },
  { href: '/app/reports', label: 'Reports', icon: FileText },
  { href: '/app/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-base transition-colors',
                active ? 'bg-surface-2 text-ink before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded before:bg-signal' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink',
              )}
            >
              <Icon className={cx('size-4', active ? 'text-signal' : 'text-ink-3')} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SymbolSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const s = q.trim().toUpperCase();
        if (s) router.push(`/app/markets?q=${encodeURIComponent(s)}`);
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Search symbols
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        ref={ref}
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a company or symbol"
        className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-bg/60 pr-10 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-gold focus:outline-none"
      />
      <kbd className="absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line-strong px-1.5 text-caption text-ink-3 sm:block">/</kbd>
    </form>
  );
}

function NotificationBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.get<{ unreadCount: number }>('/notifications?pageSize=1'), refetchInterval: 60_000 });
  const n = data?.unreadCount ?? 0;
  return (
    <Link href="/app/alerts#notifications" className="relative rounded-[var(--radius-control)] p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={n ? `Notifications, ${n} unread` : 'Notifications'}>
      <Bell className="size-[18px]" aria-hidden />
      {n > 0 && <span className="num absolute top-1 right-1 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] leading-4 font-semibold text-bg">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (me.isError) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [me.isError, router]);

  if (me.isLoading || me.isError) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label={me.isError ? 'Redirecting to sign in' : 'Loading your workspace'} />
      </div>
    );
  }

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/login');
  };

  const sidebar = (onNavigate?: () => void) => (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/app" aria-label="AlphaPulse AI home" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line px-4 py-3 text-sm">
        <p className="truncate text-ink">{me.data!.name}</p>
        <p className="truncate text-caption text-ink-3">
          {me.data!.email}
          {me.data!.role === 'admin' ? ', administrator' : ''}
        </p>
        <button onClick={logout} className="mt-2 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
          <LogOut className="size-3.5" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen border-r border-line bg-surface-1/60 lg:block">{sidebar()}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-bg/80" aria-label="Close navigation" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] border-r border-line bg-surface-1">
            <button className="absolute top-3 right-3 rounded p-1.5 text-ink-3 hover:text-ink" onClick={() => setDrawer(false)} aria-label="Close navigation">
              <X className="size-4" />
            </button>
            {sidebar(() => setDrawer(false))}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:px-6">
          <button className="rounded p-1.5 text-ink-2 hover:text-ink lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <SymbolSearch />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-line-strong px-2.5 py-0.5 text-caption text-ink-3 md:inline" title="AlphaPulse researches and monitors. It never places trades or connects to brokerages.">
              Research only, no trading
            </span>
            <NotificationBell />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-6 focus:outline-none lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
