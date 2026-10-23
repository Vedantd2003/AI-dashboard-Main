import { AppError, upstream } from './errors.js';

/**
 * JSON client for FIXED, trusted provider hosts (Twelve Data, Finnhub, SEC, OpenRouter, Resend).
 * User-supplied URLs must use safeFetch instead.
 * Retries: up to `retries` on network errors, 429 and 5xx, exponential backoff 250ms·2^n with jitter.
 */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  init?: RequestInit;
  fetchImpl?: FetchLike;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RateLimitedError extends AppError {
  constructor(provider: string, public readonly retryAfterSeconds: number | null) {
    super(429, 'provider_rate_limited', `${provider} rate limit reached`, { provider, retryAfterSeconds });
  }
}

export async function httpJson<T = unknown>(url: string, opts: HttpOptions): Promise<T> {
  const { provider, timeoutMs = 10_000, retries = 2, fetchImpl = fetch } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { ...opts.init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        lastErr = new RateLimitedError(provider, Number.isFinite(ra) ? ra : null);
      } else if (res.status >= 500) {
        lastErr = upstream(provider, `${provider} returned ${res.status}`);
      } else if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw upstream(provider, `${provider} returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`, res.status === 401 || res.status === 403 ? 502 : 502);
      } else {
        return (await res.json()) as T;
      }
    } catch (e) {
      if (e instanceof AppError && e.code === 'upstream_error' && !String(e.message).match(/returned 5\d\d/)) throw e;
      lastErr = e instanceof AppError ? e : upstream(provider, (e as Error).name === 'TimeoutError' ? `${provider} timed out` : `${provider} unreachable`);
    }
    if (attempt < retries) await sleep(250 * 2 ** attempt + Math.random() * 100);
  }
  throw lastErr;
}
