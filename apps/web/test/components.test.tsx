import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { compact, money, pct, relative } from '@/lib/format';
import { Delta, DataTable, FreshnessBadge } from '@/components/ui/data';
import { Button, Field, Input, SkeletonRows } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ClaimRow, SourceList } from '@/components/research-note';
import { NAV } from '@/components/app-shell';
import { LoginForm, RegisterForm } from '@/components/auth-forms';
import type { Claim, SourceRef } from '@/lib/types';

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('format helpers', () => {
  it('formats fractions as signed percents with a true minus sign', () => {
    expect(pct(0.0512)).toBe('+5.12%');
    expect(pct(-0.1)).toBe('−10.00%');
    expect(pct(null)).toBe('—');
  });
  it('formats money and compact numbers, never inventing values', () => {
    expect(money(1234.5, 'USD')).toBe('$1,234.50');
    expect(money(undefined)).toBe('—');
    expect(compact(3e12, 'USD')).toBe('3T USD');
  });
  it('relative time', () => {
    expect(relative(new Date(Date.now() - 120_000).toISOString())).toBe('2 min ago');
  });
});

describe('Delta', () => {
  it('carries meaning by sign and arrow, not colour alone', () => {
    const { container } = render(<Delta value={-0.025} />);
    expect(container.textContent).toBe('−2.50%');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
  it('shows a dash for missing data', () => {
    render(<Delta value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('FreshnessBadge', () => {
  it('labels delayed data explicitly', () => {
    render(<FreshnessBadge freshness="delayed" provider="Twelve Data" />);
    expect(screen.getByText('Delayed')).toHaveAttribute('title', expect.stringMatching(/not suitable for trading/));
    expect(screen.getByText('Twelve Data')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('loading skeleton is announced', () => {
    render(<SkeletonRows label="Loading watchlists" />);
    expect(screen.getByRole('status', { name: 'Loading watchlists' })).toBeInTheDocument();
  });
  it('empty state shows guidance and an action', () => {
    render(<EmptyState title="No watchlists yet" action={<button>Create a watchlist</button>}>Track companies.</EmptyState>);
    expect(screen.getByText('No watchlists yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a watchlist' })).toBeInTheDocument();
  });
  it('error state is an alert with retry', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(502, 'upstream_error', 'Provider timed out')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Provider timed out');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
  });
  it('not-configured errors render setup guidance, not a failure', () => {
    render(<ErrorState error={new ApiError(503, 'integration_not_configured', 'Market data is not configured', { hint: 'Set TWELVE_DATA_API_KEY.' })} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Set TWELVE_DATA_API_KEY.')).toBeInTheDocument();
  });
});

describe('form controls', () => {
  it('Field associates label, hint and error with the input', () => {
    render(
      <Field label="Email" htmlFor="e" error="Required">
        <Input id="e" aria-invalid />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
  it('disabled buttons explain why', () => {
    render(
      <Button disabled disabledReason="Enter a symbol first">
        Add symbol
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Add symbol' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('title', 'Enter a symbol first');
  });
  it('loading buttons are busy and disabled', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DataTable', () => {
  it('has a caption and column headers for screen readers', () => {
    render(
      <DataTable caption="Positions" head={[{ label: 'Symbol' }, { label: 'Value', align: 'right' }]}>
        <tr>
          <td>AAPL</td>
          <td>1</td>
        </tr>
      </DataTable>,
    );
    expect(screen.getByRole('table', { name: 'Positions' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });
});

describe('research note', () => {
  const sources: SourceRef[] = [{ id: 'S1', documentId: 'd', title: 'Form 10-Q', url: 'https://www.sec.gov/x', publisher: 'SEC', publishedAt: '2026-08-01T00:00:00Z', retrievedAt: '2026-08-02T00:00:00Z', kind: 'filing', origin: 'primary' }];
  it('reveals the cited passage on demand, keyboard-accessible', async () => {
    const claim: Claim = { text: 'Revenue rose 6%.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'revenue increased 6 percent' }] };
    render(
      <ol>
        <ClaimRow claim={claim} sources={sources} />
      </ol>,
    );
    expect(screen.getByText(/Source:/)).toHaveClass('sr-only');
    const btn = screen.getByRole('button', { name: 'Show cited passage from source 1' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    btn.focus();
    await userEvent.keyboard('{Enter}');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/revenue increased 6 percent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open source/ })).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
  it('flags unverified claims in words', () => {
    render(
      <ol>
        <ClaimRow claim={{ text: 'Competitor will cut prices.', basis: 'unverified', citations: [] }} sources={sources} />
      </ol>,
    );
    expect(screen.getByText(/Not supported by retrieved sources/)).toBeInTheDocument();
  });
  it('source list shows provenance', () => {
    render(<SourceList sources={sources} />);
    expect(screen.getByText(/Primary source from SEC/)).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('has the ten primary sections in order', () => {
    expect(NAV.map((n) => n.label)).toEqual(['Overview', 'Markets', 'Watchlists', 'Research', 'AI Analyst', 'Portfolio Lab', 'Alerts', 'Automations', 'Reports', 'Settings']);
  });
});

describe('api client', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('sends the CSRF header on mutations only and uses same-origin credentials', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"ok":true}', { status: 200 }));
    await api.get('/x');
    await api.post('/y', { a: 1 });
    const [, getInit] = f.mock.calls[0]!;
    const [, postInit] = f.mock.calls[1]!;
    expect((getInit!.headers as Record<string, string>)['X-AlphaPulse-CSRF']).toBeUndefined();
    expect((postInit!.headers as Record<string, string>)['X-AlphaPulse-CSRF']).toBe('1');
    expect(postInit!.credentials).toBe('same-origin');
  });
  it('maps error envelopes to ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"code":"integration_not_configured","message":"LLM is not configured","details":{"hint":"Set OPENROUTER_API_KEY"}}}', { status: 503 }));
    const e = (await api.get('/x').catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.notConfigured).toBe(true);
    expect(e.hint).toBe('Set OPENROUTER_API_KEY');
  });
});

describe('auth forms', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('register validates before calling the API', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    wrap(<RegisterForm />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ana');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(f).not.toHaveBeenCalled();
  });
  it('login shows the API error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"code":"unauthorized","message":"Invalid email or password"}}', { status: 401 }));
    wrap(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
  });
});
