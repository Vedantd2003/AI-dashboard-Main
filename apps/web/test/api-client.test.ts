import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';

const html = (status: number) => new Response('<html>Bad Gateway</html>', { status, headers: { 'content-type': 'text/html' } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('api client while the API is asleep', () => {
  it('waits for the API to wake, then sends a POST once more', async () => {
    const calls: string[] = [];
    let healthy = false;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/v1/health') {
        const r = healthy ? json({ status: 'ok' }) : html(502);
        healthy = true;
        return r;
      }
      return healthy ? json({ user: { id: '1' } }, 201) : html(502);
    });
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const p = api.post('/auth/register', { email: 'a@b.co' });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toEqual({ user: { id: '1' } });
    vi.useRealTimers();
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(2);
    expect(calls).toContain('GET /api/v1/health');
  });

  it('does not repeat a POST the API actually answered', async () => {
    let posts = 0;
    vi.stubGlobal('fetch', async () => {
      posts++;
      return json({ error: { code: 'conflict', message: 'Email already registered' } }, 409);
    });
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({ status: 409 });
    expect(posts).toBe(1);
  });
});
