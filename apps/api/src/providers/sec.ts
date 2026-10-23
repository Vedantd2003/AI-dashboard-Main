import type { FetchLike } from '../lib/http.js';
import { httpJson } from '../lib/http.js';
import { htmlToText } from '../lib/html.js';
import { upstream } from '../lib/errors.js';

/**
 * SEC EDGAR (https://www.sec.gov/os/accessing-edgar-data).
 * Fair access: ≤ 10 requests/second and a descriptive User-Agent with contact email (SEC_USER_AGENT).
 * We throttle to ~5 req/s with a simple serial queue.
 */
export interface Filing {
  cik: string;
  company: string;
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  description: string;
  url: string;
}

const RELEVANT_FORMS = new Set(['10-K', '10-Q', '8-K', '6-K', '20-F', '10-K/A', '10-Q/A', '8-K/A', 'DEF 14A', 'S-1']);

export class SecEdgarClient {
  readonly name = 'SEC EDGAR';
  private tickerMap: Map<string, { cik: string; title: string }> | null = null;
  private tickerMapAt = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly userAgent: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Serialize requests with ≥ 200ms spacing. */
  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => new Promise((r) => setTimeout(r, 200)),
      () => new Promise((r) => setTimeout(r, 200)),
    );
    return run;
  }

  private json<T>(url: string) {
    return this.throttle(() =>
      httpJson<T>(url, { provider: this.name, fetchImpl: this.fetchImpl, init: { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' } } }),
    );
  }

  async cikForTicker(ticker: string): Promise<{ cik: string; title: string } | null> {
    if (!this.tickerMap || Date.now() - this.tickerMapAt > 24 * 3600_000) {
      const raw = await this.json<Record<string, { cik_str: number; ticker: string; title: string }>>('https://www.sec.gov/files/company_tickers.json');
      this.tickerMap = new Map(Object.values(raw).map((r) => [r.ticker.toUpperCase(), { cik: String(r.cik_str).padStart(10, '0'), title: r.title }]));
      this.tickerMapAt = Date.now();
    }
    return this.tickerMap.get(ticker.toUpperCase().replace('.', '-')) ?? null;
  }

  async recentFilings(ticker: string, sinceDays = 120, limit = 8): Promise<Filing[]> {
    const c = await this.cikForTicker(ticker);
    if (!c) return [];
    const sub = await this.json<{
      name: string;
      filings: { recent: Record<'accessionNumber' | 'filingDate' | 'form' | 'primaryDocument' | 'primaryDocDescription', string[]> };
    }>(`https://data.sec.gov/submissions/CIK${c.cik}.json`);
    const r = sub.filings?.recent;
    if (!r) return [];
    const since = Date.now() - sinceDays * 86_400_000;
    const out: Filing[] = [];
    for (let i = 0; i < r.form.length && out.length < limit; i++) {
      const form = r.form[i]!;
      if (!RELEVANT_FORMS.has(form)) continue;
      if (Date.parse(r.filingDate[i]!) < since) break;
      const acc = r.accessionNumber[i]!;
      const cikNum = String(Number(c.cik));
      out.push({
        cik: c.cik,
        company: sub.name,
        form,
        filingDate: r.filingDate[i]!,
        accessionNumber: acc,
        primaryDocument: r.primaryDocument[i]!,
        description: r.primaryDocDescription[i] || form,
        url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, '')}/${r.primaryDocument[i]}`,
      });
    }
    return out;
  }

  /** Fetch a filing's primary document as plain text (capped). Only sec.gov URLs are accepted. */
  async filingText(url: string, maxChars = 150_000): Promise<string> {
    if (!/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(url)) throw upstream(this.name, 'Refusing non-EDGAR URL');
    return this.throttle(async () => {
      const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw upstream(this.name, `EDGAR returned ${res.status}`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > 15 * 1024 * 1024) throw upstream(this.name, 'Filing document too large');
      return htmlToText(await res.text(), maxChars);
    });
  }
}
