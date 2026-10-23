export type Freshness = 'realtime' | 'delayed' | 'eod';

export interface Quote {
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  isMarketOpen: boolean | null;
  freshness: Freshness;
  provider: string;
  asOf: string | null;
  retrievedAt: string;
}

export interface Bar {
  date: string;
  close: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
}

export interface SeriesSummary {
  start: string | null;
  end: string | null;
  observations: number;
  lastClose: number | null;
  dailyChange: number | null;
  periodReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
}

export interface History {
  symbol: string;
  currency: string | null;
  exchangeTimezone: string | null;
  bars: Bar[];
  freshness: Freshness;
  provider: string;
  asOf: string | null;
  retrievedAt: string;
  range: string;
  summary: SeriesSummary;
}

export interface Settled<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: 'ratio' | 'percent' | 'currency' | 'number';
  period: string;
}

export interface Profile {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  industry: string | null;
  ipo: string | null;
  website: string | null;
  marketCap: number | null;
  provider: string;
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

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  timezone: string;
  dashboardWidgets: string[];
  notificationPrefs: { inApp: boolean; email: boolean; webhook: boolean; webhookUrl: string | null; dailyBrief: boolean; weeklyDigest: boolean };
}

export interface WatchlistItem {
  _id: string;
  symbol: string;
  note: string;
  addedAt: string;
  quote?: Quote | null;
  quoteError?: string | null;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  items: WatchlistItem[];
  marketDataConfigured?: boolean;
  updatedAt: string;
}

export type ClaimBasis = 'observed_data' | 'source_reported' | 'calculated' | 'interpretation' | 'speculative' | 'unverified';

export interface Claim {
  text: string;
  basis: ClaimBasis;
  citations: { sourceId: string; evidence: string }[];
}

export interface SourceRef {
  id: string;
  documentId: string;
  title: string;
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  kind: string;
  origin: string;
  cited?: boolean;
}

export interface Report {
  id: string;
  kind: 'research' | 'daily_brief' | 'weekly_digest';
  title: string;
  researchQuestion: string;
  symbols: string[];
  generatedAt: string;
  executiveSummary: string;
  keyFindings: Claim[];
  bullishFactors: Claim[];
  bearishFactors: Claim[];
  risks: Claim[];
  uncertainties: string[];
  followUpQuestions: string[];
  limitations: string[];
  evidenceStrength: 'weak' | 'moderate' | 'strong';
  financialMetrics: Record<string, unknown>;
  sourceReferences: SourceRef[];
  citationStats: { total: number; verified: number; downgraded: number; droppedCitations: number };
  dataFreshness: Record<string, { provider?: string; asOf?: string | null; freshness?: string; retrievedAt?: string }>;
  model: string;
  disclaimer: string;
  saved: boolean;
  shareToken?: string | null;
}

export interface Alert {
  id: string;
  symbol: string;
  type: 'price_above' | 'price_below' | 'pct_move';
  threshold: number;
  cooldownMinutes: number;
  channels: ('in_app' | 'email' | 'webhook')[];
  active: boolean;
  lastTriggeredAt: string | null;
  lastEvaluatedAt: string | null;
  lastEvaluation: string | null;
}

export interface Delivery {
  channel: 'in_app' | 'email' | 'webhook';
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  error: string | null;
  at: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  deliveries: Delivery[];
}

export interface WorkflowExecution {
  id: string;
  workflowKey: string;
  trigger: 'scheduler' | 'n8n' | 'manual';
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  metrics: Record<string, unknown>;
  error: string | null;
  rerunOf: string | null;
}

export interface WorkflowDef {
  id: string;
  key: 'daily_brief' | 'watchlist_monitor' | 'weekly_digest' | 'source_health';
  name: string;
  description: string;
  enabled: boolean;
  schedule: string;
  timezone: string;
  trigger: 'scheduler' | 'n8n' | 'manual';
  lastRunAt?: string;
  lastStatus?: string;
  lastExecution: WorkflowExecution | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
