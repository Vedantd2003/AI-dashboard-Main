import { XMLParser } from 'fast-xml-parser';
import { Types } from 'mongoose';
import { canonicalUrl } from '@alphapulse/shared';
import type { Deps } from '../deps.js';
import { sha256 } from '../lib/crypto.js';
import { AppError, badRequest } from '../lib/errors.js';
import { htmlToText, stripTags } from '../lib/html.js';
import { SourceDocument } from '../models/index.js';
import type { NewsItem } from '../providers/types.js';
import type { MarketService } from './markets.js';

type SourceInput = {
  ownerId?: Types.ObjectId | null;
  kind: 'news' | 'filing' | 'rss' | 'upload' | 'ir_page';
  origin: 'primary' | 'secondary' | 'upload';
  provider: string;
  url?: string | null;
  title: string;
  publisher?: string | null;
  publishedAt?: Date | null;
  symbols?: string[];
  text: string;
  summary?: string;
  mimeType?: string | null;
  bytes?: number | null;
  extraction?: { status: 'ok' | 'partial' | 'failed'; error?: string | null; pages?: number | null };
  meta?: Record<string, unknown>;
};

/** Idempotent upsert keyed on (ownerId, contentHash). Re-ingesting the same item only refreshes retrievedAt/symbols. */
export async function upsertSource(input: SourceInput, now = new Date()) {
  const cu = input.url ? canonicalUrl(input.url) : null;
  const contentHash = sha256(cu ?? `${input.title}\n${input.text.slice(0, 20_000)}`);
  const ownerId = input.ownerId ?? null;
  // Concurrent upserts of the same document can race on the unique (ownerId, contentHash) index (E11000);
  // the losing writer retries, which then matches the winner's document.
  for (let attempt = 0; ; attempt++) {
    try {
      return await upsertOnce(input, ownerId, cu, contentHash, now);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000 || attempt >= 2) throw e;
    }
  }
}

function upsertOnce(input: SourceInput, ownerId: Types.ObjectId | null, cu: string | null, contentHash: string, now: Date) {
  return SourceDocument.findOneAndUpdate(
    { ownerId, contentHash },
    {
      $setOnInsert: {
        ownerId,
        kind: input.kind,
        origin: input.origin,
        provider: input.provider,
        url: input.url ?? null,
        canonicalUrl: cu,
        title: input.title.slice(0, 500),
        publisher: input.publisher ?? null,
        publishedAt: input.publishedAt ?? null,
        text: input.text.slice(0, 400_000),
        summary: (input.summary ?? '').slice(0, 2000),
        contentHash,
        mimeType: input.mimeType ?? null,
        bytes: input.bytes ?? null,
        extraction: input.extraction ?? { status: 'ok', error: null, pages: null },
        meta: input.meta ?? {},
      },
      $set: { retrievedAt: now },
      $addToSet: { symbols: { $each: input.symbols ?? [] } },
    },
    { upsert: true, returnDocument: 'after' },
  );
}

/** News: the provider's headline + summary are the citable text (full articles are not fetched — publisher terms). */
export async function ingestNews(items: NewsItem[], now = new Date()) {
  const docs = [];
  for (const n of items) {
    const summary = stripTags(n.summary);
    docs.push(
      await upsertSource(
        {
          kind: 'news',
          origin: 'secondary',
          provider: n.provider,
          url: n.url,
          title: stripTags(n.headline),
          publisher: n.source,
          publishedAt: new Date(n.publishedAt),
          symbols: n.symbol ? [n.symbol] : [],
          text: `${stripTags(n.headline)}\n${summary}`,
          summary,
        },
        now,
      ),
    );
  }
  return docs;
}

/** SEC filings for a US ticker. Full text is fetched for the `withTextLimit` most recent filings. */
export async function ingestFilings(deps: Deps, symbol: string, sinceDays: number, withTextLimit = 2) {
  if (!deps.sec) return [];
  const filings = await deps.sec.recentFilings(symbol, sinceDays);
  const docs = [];
  for (const [i, f] of filings.entries()) {
    let text = `${f.company} filed Form ${f.form} (${f.description}) with the SEC on ${f.filingDate}. Accession number ${f.accessionNumber}.`;
    let extraction: SourceInput['extraction'] = { status: 'partial', error: 'metadata only', pages: null };
    if (i < withTextLimit) {
      try {
        const body = await deps.sec.filingText(f.url);
        if (body.length > 200) {
          text = `${text}\n\n${body}`;
          extraction = { status: 'ok', error: null, pages: null };
        }
      } catch (e) {
        extraction = { status: 'partial', error: (e as Error).message.slice(0, 200), pages: null };
      }
    }
    docs.push(
      await upsertSource({
        kind: 'filing',
        origin: 'primary',
        provider: 'SEC EDGAR',
        url: f.url,
        title: `${f.company} — Form ${f.form} (${f.filingDate})`,
        publisher: 'U.S. Securities and Exchange Commission',
        publishedAt: new Date(`${f.filingDate}T00:00:00Z`),
        symbols: [symbol],
        text,
        summary: `${f.form}: ${f.description}`,
        extraction,
        meta: { form: f.form, accessionNumber: f.accessionNumber, cik: f.cik },
      }),
    );
  }
  return docs;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, htmlEntities: false });

export interface ParsedFeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
}

/** Parses RSS 2.0 and Atom. Entity expansion is disabled (no billion-laughs); text is tag-stripped. */
export function parseFeed(text: string): { title: string; items: ParsedFeedItem[] } {
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(text) as Record<string, unknown>;
  } catch {
    throw badRequest('Feed is not valid XML');
  }
  const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  const str = (x: unknown): string => (typeof x === 'string' ? x : x && typeof x === 'object' && '#text' in x ? String((x as Record<string, unknown>)['#text']) : '');
  const rss = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  if (rss) {
    return {
      title: stripTags(str(rss.title)),
      items: arr(rss.item as Record<string, unknown>[]).map((i) => ({
        title: stripTags(str(i.title)),
        link: str(i.link).trim(),
        summary: stripTags(str(i.description)).slice(0, 2000),
        publishedAt: str(i.pubDate) && !Number.isNaN(Date.parse(str(i.pubDate))) ? new Date(str(i.pubDate)).toISOString() : null,
      })),
    };
  }
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    return {
      title: stripTags(str(feed.title)),
      items: arr(feed.entry as Record<string, unknown>[]).map((e) => {
        const links = arr(e.link as Record<string, string>[]);
        const link = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'] ?? '';
        const date = str(e.updated) || str(e.published);
        return {
          title: stripTags(str(e.title)),
          link,
          summary: stripTags(str(e.summary) || str(e.content)).slice(0, 2000),
          publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
        };
      }),
    };
  }
  throw badRequest('Unrecognized feed format (expected RSS 2.0 or Atom)');
}

/** Imports a user-supplied RSS/Atom feed through the SSRF guard. Items are owner-scoped. */
export async function ingestRssFeed(deps: Deps, ownerId: Types.ObjectId, url: string, symbols: string[]) {
  const res = await deps.safeFetch(url, {
    timeoutMs: 10_000,
    maxBytes: 2 * 1024 * 1024,
    allowedContentTypes: ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'],
  });
  if (res.status !== 200) throw new AppError(502, 'feed_fetch_failed', `Feed returned HTTP ${res.status}`);
  const feed = parseFeed(res.text);
  const docs = [];
  for (const item of feed.items.slice(0, 50)) {
    if (!item.title || !/^https?:\/\//.test(item.link)) continue;
    docs.push(
      await upsertSource({
        ownerId,
        kind: 'rss',
        origin: 'secondary',
        provider: 'RSS',
        url: item.link,
        title: item.title,
        publisher: feed.title || new URL(res.finalUrl).hostname,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        symbols,
        text: `${item.title}\n${item.summary}`,
        summary: item.summary,
        meta: { feedUrl: res.finalUrl },
      }),
    );
  }
  return { feedTitle: feed.title, imported: docs.length, documents: docs };
}

export const UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOADS: Record<string, 'pdf' | 'text'> = {
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/x-markdown': 'text',
};

/** Validates type by MIME and magic bytes, extracts text, records extraction status honestly. */
export async function ingestUpload(
  ownerId: Types.ObjectId,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  symbols: string[],
) {
  const kind = ALLOWED_UPLOADS[file.mimetype];
  if (!kind) throw new AppError(415, 'unsupported_file', 'Only PDF, TXT and Markdown files are accepted');
  if (file.size > UPLOAD_LIMIT_BYTES) throw new AppError(413, 'file_too_large', 'Files are limited to 10 MB');
  let text = '';
  let extraction: SourceInput['extraction'] = { status: 'ok', error: null, pages: null };
  if (kind === 'pdf') {
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new AppError(415, 'unsupported_file', 'File is not a valid PDF');
    try {
      const { getDocumentProxy, extractText } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
      const r = await extractText(pdf, { mergePages: true });
      text = String(r.text).replace(/\s+\n/g, '\n').trim();
      extraction = { status: text.length > 50 ? 'ok' : 'partial', error: text.length > 50 ? null : 'little or no extractable text (scanned PDF?)', pages: r.totalPages };
    } catch (e) {
      extraction = { status: 'failed', error: `PDF extraction failed: ${(e as Error).message.slice(0, 200)}`, pages: null };
    }
  } else {
    if (file.buffer.includes(0)) throw new AppError(415, 'unsupported_file', 'Text file contains binary data');
    text = file.buffer.toString('utf8');
  }
  const title = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'Uploaded document';
  return upsertSource({
    ownerId,
    kind: 'upload',
    origin: 'upload',
    provider: 'User upload',
    title,
    publisher: 'Uploaded by you',
    publishedAt: null,
    symbols,
    text,
    summary: text.slice(0, 400),
    mimeType: file.mimetype,
    bytes: file.size,
    extraction,
  });
}

/** Collects (and refreshes) source documents relevant to a research request. */
export async function gatherSources(
  deps: Deps,
  markets: MarketService,
  opts: { userId: Types.ObjectId | null; symbols: string[]; lookbackDays: number; documentIds: string[] },
  log: (step: string, status: 'ok' | 'skipped' | 'failed', detail: string) => void,
) {
  const since = new Date(deps.now().getTime() - opts.lookbackDays * 86_400_000);
  for (const s of opts.symbols) {
    if (deps.fundamentals) {
      try {
        const news = await markets.companyNews(s, opts.lookbackDays);
        await ingestNews(news);
        log(`news:${s}`, 'ok', `${news.length} articles from Finnhub`);
      } catch (e) {
        log(`news:${s}`, 'failed', (e as Error).message);
      }
    } else log(`news:${s}`, 'skipped', 'news provider not configured');
    if (deps.sec) {
      try {
        const f = await ingestFilings(deps, s, Math.max(opts.lookbackDays, 120));
        log(`filings:${s}`, 'ok', `${f.length} SEC filings`);
      } catch (e) {
        log(`filings:${s}`, 'failed', (e as Error).message);
      }
    } else log(`filings:${s}`, 'skipped', 'SEC_USER_AGENT not configured');
  }
  const ownerFilter = opts.userId ? [{ ownerId: null }, { ownerId: opts.userId }] : [{ ownerId: null }];
  const recent = await SourceDocument.find({
    $or: ownerFilter,
    symbols: { $in: opts.symbols },
    $and: [{ $or: [{ publishedAt: { $gte: since } }, { kind: 'filing', publishedAt: { $gte: new Date(deps.now().getTime() - 120 * 86_400_000) } }] }],
  })
    .sort({ publishedAt: -1 })
    .limit(80)
    .lean();
  const explicit = opts.documentIds.length && opts.userId
    ? await SourceDocument.find({ _id: { $in: opts.documentIds }, ownerId: opts.userId }).lean()
    : [];
  if (opts.documentIds.length && explicit.length !== opts.documentIds.length) {
    log('documents', 'failed', 'some selected documents were not found or are not yours');
  }
  return [...explicit, ...recent.filter((r) => !explicit.some((e) => String(e._id) === String(r._id)))];
}

/** Exposed for the IR-page option: fetch a public HTML page as text through the SSRF guard. */
export async function fetchPageText(deps: Deps, url: string) {
  const r = await deps.safeFetch(url, { allowedContentTypes: ['text/html', 'application/xhtml+xml'], maxBytes: 3 * 1024 * 1024 });
  return { finalUrl: r.finalUrl, text: htmlToText(r.text, 150_000) };
}
