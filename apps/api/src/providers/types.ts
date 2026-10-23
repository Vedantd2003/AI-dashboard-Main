export type Freshness = 'realtime' | 'delayed' | 'eod';

export interface ProviderStamp {
  provider: string;
  /** Provider's own timestamp for the data (ISO). */
  asOf: string | null;
  /** When AlphaPulse retrieved it (ISO). */
  retrievedAt: string;
}

export interface Quote extends ProviderStamp {
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  isMarketOpen: boolean | null;
  freshness: Freshness;
}

export interface Bar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface History extends ProviderStamp {
  symbol: string;
  interval: '1day';
  currency: string | null;
  exchangeTimezone: string | null;
  bars: Bar[];
  freshness: Freshness;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string | null;
  country: string | null;
  type: string | null;
  currency: string | null;
}

export interface CompanyProfile extends ProviderStamp {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  industry: string | null;
  ipo: string | null;
  website: string | null;
  /** In the listing currency, absolute units (converted from provider millions). */
  marketCap: number | null;
  sharesOutstanding: number | null;
}

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: 'ratio' | 'percent' | 'currency' | 'number';
  /** e.g. "TTM", "Quarterly", "Annual", "52W" — so ratios are never compared across mismatched periods silently. */
  period: string;
}

export interface FinancialMetrics extends ProviderStamp {
  symbol: string;
  currency: string | null;
  metrics: Metric[];
}

export interface MarketState extends ProviderStamp {
  exchange: string;
  isOpen: boolean | null;
  timeToOpen: string | null;
  timeToClose: string | null;
}

export interface NewsItem {
  id: string;
  symbol: string | null;
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  provider: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: {
    quote: boolean;
    history: boolean;
    search: boolean;
    marketState: boolean;
    exchanges: string[];
  };
  getQuote(symbol: string): Promise<Quote>;
  getHistory(symbol: string, outputSize: number): Promise<History>;
  search(q: string): Promise<SymbolMatch[]>;
  getMarketState(exchange: string): Promise<MarketState>;
}

export interface FundamentalsProvider {
  readonly name: string;
  getProfile(symbol: string): Promise<CompanyProfile>;
  getMetrics(symbol: string): Promise<FinancialMetrics>;
  getCompanyNews(symbol: string, from: string, to: string): Promise<NewsItem[]>;
  getMarketNews(): Promise<NewsItem[]>;
  /** Optional backup quote source, used when the primary market-data provider fails. */
  getQuote?(symbol: string): Promise<Quote>;
}
