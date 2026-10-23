import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';
import { AppError } from './errors.js';

/**
 * SSRF-hardened fetch for user-supplied URLs (RSS feeds, IR pages, webhook targets).
 *  - http/https only, no embedded credentials, ports 80/443 only
 *  - every resolved address must be public unicast (blocks loopback, RFC1918, link-local incl. 169.254.169.254,
 *    CGNAT, multicast, reserved, IPv6 ULA/link-local, IPv4-mapped private)
 *  - the connection is pinned to the validated IP (no DNS-rebinding window)
 *  - manual redirects, each hop re-validated, max 3
 *  - timeout, response size cap, content-type allow-list
 */

export type Resolver = (host: string) => Promise<LookupAddress[]>;
const defaultResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const ip = ipaddr.process(address); // unwraps IPv4-mapped IPv6
  return ip.range() === 'unicast';
}

export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<{ url: URL; address: LookupAddress }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'invalid_url', 'URL is not valid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AppError(400, 'invalid_url', 'Only http(s) URLs are allowed');
  if (url.username || url.password) throw new AppError(400, 'invalid_url', 'Credentials in URLs are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new AppError(400, 'invalid_url', 'Only ports 80 and 443 are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new AppError(400, 'blocked_destination', 'Destination is not allowed');
  }
  const addresses = ipaddr.isValid(host) ? [{ address: host, family: host.includes(':') ? 6 : 4 }] : await resolve(host).catch(() => []);
  if (!addresses.length) throw new AppError(400, 'invalid_url', 'Host could not be resolved');
  if (!addresses.every((a) => isPublicAddress(a.address))) {
    throw new AppError(400, 'blocked_destination', 'Destination resolves to a non-public address');
  }
  return { url, address: addresses[0]! };
}

export interface SafeFetchOptions {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: string[];
  maxRedirects?: number;
  resolve?: Resolver;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  bytes: Buffer;
}

async function readCapped(body: AsyncIterable<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new AppError(413, 'response_too_large', `Response exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 3, resolve = defaultResolver } = opts;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, address } = await assertPublicUrl(current, resolve);
    const dispatcher = new Agent({
      connect: {
        lookup: (_h: string, _o: unknown, cb: (err: Error | null, addr: string | LookupAddress[], fam?: number) => void) =>
          (_o as { all?: boolean })?.all ? cb(null, [address]) : cb(null, address.address, address.family),
      },
    });
    try {
      const res = await undiciFetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'user-agent': 'AlphaPulseBot/0.1 (+research ingestion)', ...opts.headers },
        body: opts.body,
        redirect: 'manual',
        dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, url).toString();
        await res.body?.cancel();
        continue;
      }
      const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (opts.allowedContentTypes && !opts.allowedContentTypes.some((t) => contentType === t || contentType.endsWith('+xml') && t === 'application/xml')) {
        await res.body?.cancel();
        throw new AppError(415, 'unsupported_content_type', `Unexpected content type: ${contentType || 'none'}`);
      }
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > maxBytes) {
        await res.body?.cancel();
        throw new AppError(413, 'response_too_large', `Response exceeds ${maxBytes} bytes`);
      }
      const bytes = await readCapped(res.body, maxBytes);
      return { status: res.status, finalUrl: url.toString(), contentType, bytes, text: bytes.toString('utf8') };
    } catch (e) {
      if (e instanceof AppError) throw e;
      const name = (e as Error).name;
      throw new AppError(502, 'fetch_failed', name === 'TimeoutError' ? 'Request timed out' : 'Request failed');
    } finally {
      dispatcher.close().catch(() => undefined);
    }
  }
  throw new AppError(502, 'too_many_redirects', 'Too many redirects');
}
