import { httpJson, type FetchLike } from '../lib/http.js';
import type { CompanyProfile, FinancialMetrics, FundamentalsProvider, Metric, NewsItem } from './types.js';

/**
 * Finnhub (https://finnhub.io/docs/api). Free key: ~60 calls/min, personal / non-commercial use.
 * Used for company news, profile and basic financial metrics. Market cap is reported in MILLIONS → converted.
 */
const BASE = 'https://finnhub.io/api/v1';

/** Metric keys we surface, with explicit period + unit so ratios are never compared across periods silently. */
const METRIC_MAP: { key: string; label: string; unit: Metric['unit']; period: string; scale?: number }[] = [
  { key: 'peTTM', label: 'P/E', unit: 'ratio', period: 'TTM' },
  { key: 'psTTM', label: 'P/S', unit: 'ratio', period: 'TTM' },
  { key: 'pbQuarterly', label: 'P/B', unit: 'ratio', period: 'Quarterly' },
  { key: 'epsTTM', label: 'EPS', unit: 'currency', period: 'TTM' },
  { key: 'revenueGrowthTTMYoy', label: 'Revenue growth YoY', unit: 'percent', period: 'TTM' },
  { key: 'grossMarginTTM', label: 'Gross margin', unit: 'percent', period: 'TTM' },
  { key: 'operatingMarginTTM', label: 'Operating margin', unit: 'percent', period: 'TTM' },
  { key: 'netProfitMarginTTM', label: 'Net margin', unit: 'percent', period: 'TTM' },
  { key: 'roeTTM', label: 'Return on equity', unit: 'percent', period: 'TTM' },
  { key: 'totalDebt/totalEquityQuarterly', label: 'Debt / equity', unit: 'ratio', period: 'Quarterly' },
  { key: 'currentRatioQuarterly', label: 'Current ratio', unit: 'ratio', period: 'Quarterly' },
  { key: 'cashFlowPerShareTTM', label: 'Cash flow / share', unit: 'currency', period: 'TTM' },
  { key: 'dividendYieldIndicatedAnnual', label: 'Dividend yield', unit: 'percent', period: 'Indicated annual' },
  { key: 'beta', label: 'Beta', unit: 'ratio', period: 'Provider-defined' },
  { key: '52WeekHigh', label: '52-week high', unit: 'currency', period: '52W' },
  { key: '52WeekLow', label: '52-week low', unit: 'currency', period: '52W' },
];

export class FinnhubProvider implements FundamentalsProvider {
  readonly name = 'Finnhub';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: FetchLike,
  ) {}

  private get<T>(path: string, params: Record<string, string>) {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return httpJson<T>(u.toString(), { provider: this.name, fetchImpl: this.fetchImpl, init: { headers: { 'X-Finnhub-Token': this.apiKey } } });
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const p = await this.get<Record<string, unknown>>('/stock/profile2', { symbol });
    const mc = typeof p.marketCapitalization === 'number' ? p.marketCapitalization * 1e6 : null;
    const so = typeof p.shareOutstanding === 'number' ? p.shareOutstanding * 1e6 : null;
    return {
      symbol,
      name: (p.name as string) || null,
      exchange: (p.exchange as string) || null,
      country: (p.country as string) || null,
      currency: (p.currency as string) || null,
      industry: (p.finnhubIndustry as string) || null,
      ipo: (p.ipo as string) || null,
      website: (p.weburl as string) || null,
      marketCap: mc,
      sharesOutstanding: so,
      provider: this.name,
      asOf: null,
      retrievedAt: new Date().toISOString(),
    };
  }

  async getMetrics(symbol: string): Promise<FinancialMetrics> {
    const r = await this.get<{ metric?: Record<string, unknown> }>('/stock/metric', { symbol, metric: 'all' });
    const m = r.metric ?? {};
    const metrics: Metric[] = [];
    for (const def of METRIC_MAP) {
      const v = m[def.key];
      if (typeof v === 'number' && Number.isFinite(v)) metrics.push({ key: def.key, label: def.label, unit: def.unit, period: def.period, value: v });
    }
    return { symbol, currency: null, metrics, provider: this.name, asOf: null, retrievedAt: new Date().toISOString() };
  }

  private mapNews(rows: Record<string, unknown>[], symbol: string | null): NewsItem[] {
    return rows
      .filter((n) => typeof n.url === 'string' && typeof n.headline === 'string' && typeof n.datetime === 'number')
      .map((n) => ({
        id: String(n.id),
        symbol,
        headline: n.headline as string,
        summary: (n.summary as string) ?? '',
        url: n.url as string,
        source: (n.source as string) ?? 'Unknown',
        publishedAt: new Date((n.datetime as number) * 1000).toISOString(),
        provider: this.name,
      }));
  }

  async getCompanyNews(symbol: string, from: string, to: string): Promise<NewsItem[]> {
    const rows = await this.get<Record<string, unknown>[]>('/company-news', { symbol, from, to });
    return this.mapNews(Array.isArray(rows) ? rows : [], symbol).slice(0, 40);
  }

  async getMarketNews(): Promise<NewsItem[]> {
    const rows = await this.get<Record<string, unknown>[]>('/news', { category: 'general' });
    return this.mapNews(Array.isArray(rows) ? rows : [], null).slice(0, 30);
  }
}
