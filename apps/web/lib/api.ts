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

async function request<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  // GETs are safe to repeat, so ride out a cold start (about a minute on Render's free plan) instead of failing.
  for (let attempt = 0; ; attempt++) {
    try {
      return await once<T>(method, path, body, init);
    } catch (e) {
      const retryable = method === 'GET' && attempt < RETRY_DELAYS_MS.length && ((e instanceof ApiError && e.code === 'bad_response' && isGatewayError(e.status)) || e instanceof TypeError);
      if (!retryable) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]!);
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
