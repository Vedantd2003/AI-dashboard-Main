/** Source deduplication and ranking. */

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|cmpid$|guccounter$)/i;

/** Lowercase host, drop fragment, tracking params, trailing slash and `www.`. */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString().replace(/^http:/, 'https:');
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9%$.' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(s: string, k = 3): Set<string> {
  const words = normalizeText(s).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < k) {
    if (words.length) out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(' '));
  return out;
}

export function jaccard(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface RankableSource {
  id: string;
  url: string;
  title: string;
  publishedAt?: string | null;
  /** primary = SEC filing, company IR, exchange disclosure; secondary = news */
  kind: 'primary' | 'secondary' | 'upload';
  symbols?: string[];
}

/**
 * Remove duplicates: same canonical URL, or titles with trigram Jaccard ≥ `titleThreshold` (syndicated copies).
 * The first occurrence is kept, so pass sources in preferred order (e.g. primary first).
 */
export function dedupeSources<T extends RankableSource>(sources: readonly T[], titleThreshold = 0.6): T[] {
  const seenUrls = new Set<string>();
  const kept: T[] = [];
  for (const s of sources) {
    const cu = canonicalUrl(s.url) ?? s.url;
    if (seenUrls.has(cu)) continue;
    if (kept.some((k) => jaccard(k.title, s.title) >= titleThreshold)) continue;
    seenUrls.add(cu);
    kept.push(s);
  }
  return kept;
}

/**
 * Score = recency (half-life 7 days) × kind weight × symbol match.
 * Deterministic given `now`.
 */
export function rankSources<T extends RankableSource>(sources: readonly T[], symbols: readonly string[], now: Date = new Date()): T[] {
  const weight = { primary: 1.5, upload: 1.3, secondary: 1 } as const;
  const score = (s: T) => {
    const t = s.publishedAt ? Date.parse(s.publishedAt) : NaN;
    const ageDays = Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 86_400_000) : 30;
    const recency = Math.pow(0.5, ageDays / 7);
    const match = symbols.length && s.symbols?.some((x) => symbols.includes(x)) ? 1.2 : 1;
    return recency * weight[s.kind] * match;
  };
  return [...sources].map((s) => ({ s, v: score(s) })).sort((a, b) => b.v - a.v).map((x) => x.s);
}
