/**
 * Same-origin API client. Credentials ride on the HttpOnly session cookie; nothing is stored in localStorage.
 * Every mutation sends the CSRF header the API requires.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get hint(): string | undefined {
    const d = this.details as { hint?: string } | undefined;
    return d?.hint;
  }
  get notConfigured() {
    return this.code === 'integration_not_configured';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Gateway errors with a non-JSON body come from the hosting proxy (API asleep, waking, or redeploying), not the API. */
const isGatewayError = (status: number) => status === 502 || status === 503 || status === 504;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 20_000];

const isUnreachable = (e: unknown) => (e instanceof ApiError && e.code === 'bad_response' && (isGatewayError(e.status) || e.status === 500)) || e instanceof TypeError;

/** Public URL of the API (not a secret), set at build time from API_BASE_URL in next.config.ts. */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';

let waking: Promise<boolean> | null = null;
/**
 * Resolves once the API answers its health check (true), or after ~90 s (false). On Render's free plan the web app
 * and the API sleep independently, so opening a page does not wake the API; call this early to start it.
 */
export function wakeApi(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);
  waking ??= (async () => {
    const deadline = Date.now() + 120_000;
    let lastPoke = 0;
    while (Date.now() < deadline) {
      // Render only wakes a sleeping service for traffic from the internet; requests the web app proxies from
      // inside Render don't count. So the browser pokes the API's public URL directly (opaque, no credentials,
      // nothing is read back), then waits for the proxied health check to answer.
      if (API_ORIGIN && Date.now() - lastPoke > 10_000) {
        lastPoke = Date.now();
        void fetch(`${API_ORIGIN}/api/v1/health`, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' }).catch(() => {});
      }
      try {
        const res = await fetch('/api/v1/health', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (res.ok && (res.headers.get('content-type') ?? '').includes('application/json')) return true;
      } catch {
        /* still waking */
      }
      await sleep(3_000);
    }
    return false;
  })().finally(() => setTimeout(() => (waking = null), 60_000));
  return waking;
}

async function request<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await once<T>(method, path, body, init);
    } catch (e) {
      if (!isUnreachable(e)) throw e;
      if (method === 'GET') {
        // GETs are safe to repeat: ride out a cold start instead of failing.
        if (attempt >= RETRY_DELAYS_MS.length) throw e;
        await sleep(RETRY_DELAYS_MS[attempt]!);
      } else {
        // A gateway error means the sleeping API never received the request. Wait until it is up, then send it once more.
        if (attempt >= 1 || !(await wakeApi())) throw e;
      }
    }
  }
}

async function once<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(method !== 'GET' ? { 'X-AlphaPulse-CSRF': '1' } : {}),
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    ...init,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      res.status,
      'bad_response',
      res.status >= 500 ? 'The server is starting up or briefly unavailable. Wait a few seconds and try again.' : 'Unexpected response from the API.',
    );
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, body?: unknown) => request<T>('POST', p, body ?? {}),
  patch: <T>(p: string, body: unknown) => request<T>('PATCH', p, body),
  del: <T>(p: string, body?: unknown) => request<T>('DELETE', p, body),
  upload: <T>(p: string, form: FormData) => request<T>('POST', p, form),
};
