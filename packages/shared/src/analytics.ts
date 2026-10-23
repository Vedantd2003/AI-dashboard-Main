/**
 * Deterministic financial analytics.
 *
 * Conventions (apply to every function unless stated otherwise):
 * - Input is a price series of { date, close }. `date` is an ISO date (YYYY-MM-DD) or ISO timestamp.
 * - `cleanSeries` sorts ascending by date, drops non-finite / non-positive closes and duplicate dates (last wins).
 *   Missing observations are therefore skipped, not interpolated: a return spans the gap between two valid observations.
 * - Simple return:  r_t = P_t / P_{t-1} − 1
 * - Log return:     l_t = ln(P_t / P_{t-1})
 * - Volatility uses sample standard deviation (n − 1) of LOG returns.
 * - Annualization assumes the series frequency is trading days: σ_annual = σ_daily × √252.
 *   Pass `periodsPerYear` for other frequencies (52 weekly, 12 monthly).
 * - All results are fractions (0.05 = 5%), not percentages.
 * - Functions return `null` (or nulls in arrays) when there is not enough data, never a guessed value.
 *
 * Nothing here predicts future returns. Technical indicators describe past prices only.
 */

export interface PricePoint {
  date: string;
  close: number;
}

export const TRADING_DAYS_PER_YEAR = 252;

export function cleanSeries(series: readonly PricePoint[]): PricePoint[] {
  const byDate = new Map<string, PricePoint>();
  for (const p of series) {
    if (!p || typeof p.date !== 'string' || Number.isNaN(Date.parse(p.date))) continue;
    if (!Number.isFinite(p.close) || p.close <= 0) continue;
    byDate.set(p.date, { date: p.date, close: p.close });
  }
  return [...byDate.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** Simple returns between consecutive valid observations. Result[i] is the return ending at cleaned[i + 1]. */
export function simpleReturns(series: readonly PricePoint[]): { date: string; value: number }[] {
  const s = cleanSeries(series);
  const out: { date: string; value: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    out.push({ date: s[i]!.date, value: s[i]!.close / s[i - 1]!.close - 1 });
  }
  return out;
}

export function logReturns(series: readonly PricePoint[]): { date: string; value: number }[] {
  const s = cleanSeries(series);
  const out: { date: string; value: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    out.push({ date: s[i]!.date, value: Math.log(s[i]!.close / s[i - 1]!.close) });
  }
  return out;
}

/** Latest one-period change: P_last / P_prev − 1. */
export function dailyChange(series: readonly PricePoint[]): number | null {
  const r = simpleReturns(series);
  return r.length ? r[r.length - 1]!.value : null;
}

/** Period return between the first and last valid observation: P_end / P_start − 1. */
export function periodReturn(series: readonly PricePoint[]): number | null {
  const s = cleanSeries(series);
  if (s.length < 2) return null;
  return s[s.length - 1]!.close / s[0]!.close - 1;
}

/** Cumulative return path: C_t = P_t / P_0 − 1 (C_0 = 0). */
export function cumulativeReturns(series: readonly PricePoint[]): { date: string; value: number }[] {
  const s = cleanSeries(series);
  if (!s.length) return [];
  const base = s[0]!.close;
  return s.map((p) => ({ date: p.date, value: p.close / base - 1 }));
}

function mean(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t / xs.length;
}

/** Sample standard deviation (n − 1). Null for fewer than 2 values. */
export function sampleStdDev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / (xs.length - 1));
}

export interface VolatilityOptions {
  periodsPerYear?: number;
  /** Minimum number of returns required. Default 20 (≈ one trading month). */
  minObservations?: number;
}

/** Annualized volatility σ(log returns) × √periodsPerYear. */
export function annualizedVolatility(series: readonly PricePoint[], opts: VolatilityOptions = {}): number | null {
  const ppy = opts.periodsPerYear ?? TRADING_DAYS_PER_YEAR;
  const min = opts.minObservations ?? 20;
  const r = logReturns(series).map((x) => x.value);
  if (r.length < min) return null;
  const sd = sampleStdDev(r);
  return sd === null ? null : sd * Math.sqrt(ppy);
}

/** Rolling annualized volatility over `window` returns. Entries before the window fills are null. */
export function rollingVolatility(
  series: readonly PricePoint[],
  window: number,
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): { date: string; value: number | null }[] {
  if (!Number.isInteger(window) || window < 2) throw new RangeError('window must be an integer ≥ 2');
  const r = logReturns(series);
  return r.map((pt, i) => {
    if (i + 1 < window) return { date: pt.date, value: null };
    const slice = r.slice(i + 1 - window, i + 1).map((x) => x.value);
    const sd = sampleStdDev(slice);
    return { date: pt.date, value: sd === null ? null : sd * Math.sqrt(periodsPerYear) };
  });
}

/** Simple moving average of closes over `period`. Null until `period` observations exist. */
export function sma(series: readonly PricePoint[], period: number): { date: string; value: number | null }[] {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive integer');
  const s = cleanSeries(series);
  let sum = 0;
  return s.map((p, i) => {
    sum += p.close;
    if (i >= period) sum -= s[i - period]!.close;
    return { date: p.date, value: i + 1 >= period ? sum / period : null };
  });
}

/**
 * Exponential moving average. α = 2 / (period + 1). Seeded with the SMA of the first `period` closes,
 * then EMA_t = α·P_t + (1 − α)·EMA_{t−1}.
 */
export function ema(series: readonly PricePoint[], period: number): { date: string; value: number | null }[] {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive integer');
  const s = cleanSeries(series);
  const alpha = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  return s.map((p, i) => {
    if (i < period) {
      seedSum += p.close;
      if (i === period - 1) prev = seedSum / period;
      return { date: p.date, value: i === period - 1 ? prev : null };
    }
    prev = alpha * p.close + (1 - alpha) * (prev as number);
    return { date: p.date, value: prev };
  });
}

/**
 * Relative Strength Index with Wilder smoothing (default period 14).
 * avgGain_0 = mean(gains[1..n]), avgGain_t = (avgGain_{t−1}·(n−1) + gain_t) / n (same for losses).
 * RSI = 100 − 100 / (1 + avgGain/avgLoss); RSI = 100 when avgLoss = 0 (and 50 when both are 0).
 */
export function rsi(series: readonly PricePoint[], period = 14): { date: string; value: number | null }[] {
  if (!Number.isInteger(period) || period < 2) throw new RangeError('period must be an integer ≥ 2');
  const s = cleanSeries(series);
  const out: { date: string; value: number | null }[] = s.map((p) => ({ date: p.date, value: null }));
  if (s.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = s[i]!.close - s[i - 1]!.close;
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const toRsi = (g: number, l: number) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[period]!.value = toRsi(avgGain, avgLoss);
  for (let i = period + 1; i < s.length; i++) {
    const d = s[i]!.close - s[i - 1]!.close;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i]!.value = toRsi(avgGain, avgLoss);
  }
  return out;
}

export interface DrawdownResult {
  /** Most negative peak-to-trough decline as a fraction (e.g. −0.32). 0 if prices never fell below a prior peak. */
  maxDrawdown: number;
  peakDate: string | null;
  troughDate: string | null;
  /** First date the price regained the peak after the trough, or null if not yet recovered. */
  recoveryDate: string | null;
}

/** Maximum drawdown: min_t (P_t / max_{s≤t} P_s − 1). */
export function maxDrawdown(series: readonly PricePoint[]): DrawdownResult | null {
  const s = cleanSeries(series);
  if (s.length < 2) return null;
  let peak = s[0]!;
  let best: DrawdownResult = { maxDrawdown: 0, peakDate: null, troughDate: null, recoveryDate: null };
  let bestPeakClose = 0;
  for (const p of s) {
    if (p.close > peak.close) peak = p;
    const dd = p.close / peak.close - 1;
    if (dd < best.maxDrawdown) {
      best = { maxDrawdown: dd, peakDate: peak.date, troughDate: p.date, recoveryDate: null };
      bestPeakClose = peak.close;
    }
  }
  if (best.troughDate) {
    const troughTime = Date.parse(best.troughDate);
    const rec = s.find((p) => Date.parse(p.date) > troughTime && p.close >= bestPeakClose);
    best.recoveryDate = rec ? rec.date : null;
  }
  return best;
}

/** Drawdown path: D_t = P_t / max_{s≤t} P_s − 1. */
export function drawdownSeries(series: readonly PricePoint[]): { date: string; value: number }[] {
  const s = cleanSeries(series);
  let peak = -Infinity;
  return s.map((p) => {
    peak = Math.max(peak, p.close);
    return { date: p.date, value: p.close / peak - 1 };
  });
}

/** Keep only dates present in every series, in chronological order. */
export function alignSeries(seriesList: readonly (readonly PricePoint[])[]): { dates: string[]; closes: number[][] } {
  const cleaned = seriesList.map(cleanSeries);
  if (!cleaned.length) return { dates: [], closes: [] };
  const maps = cleaned.map((s) => new Map(s.map((p) => [p.date.slice(0, 10), p.close])));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return { dates, closes: maps.map((m) => dates.map((d) => m.get(d)!)) };
}

function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export interface CorrelationResult {
  value: number | null;
  observations: number;
  start: string | null;
  end: string | null;
  reason?: string;
}

/**
 * Pearson correlation of SIMPLE returns computed on the intersection of dates of both series.
 * Requires at least `minObservations` aligned returns (default 20).
 */
export function correlation(a: readonly PricePoint[], b: readonly PricePoint[], minObservations = 20): CorrelationResult {
  const { dates, closes } = alignSeries([a, b]);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    ra.push(closes[0]![i]! / closes[0]![i - 1]! - 1);
    rb.push(closes[1]![i]! / closes[1]![i - 1]! - 1);
  }
  const base = { observations: ra.length, start: dates[0] ?? null, end: dates[dates.length - 1] ?? null };
  if (ra.length < minObservations) {
    return { ...base, value: null, reason: `needs ≥ ${minObservations} aligned returns, have ${ra.length}` };
  }
  const v = pearson(ra, rb);
  return v === null ? { ...base, value: null, reason: 'zero variance in one series' } : { ...base, value: v };
}

/** Pairwise correlation matrix over the common date range of all series. */
export function correlationMatrix(
  named: readonly { symbol: string; series: readonly PricePoint[] }[],
  minObservations = 20,
): { symbols: string[]; matrix: (number | null)[][]; observations: number; start: string | null; end: string | null } {
  const { dates, closes } = alignSeries(named.map((n) => n.series));
  const rets = closes.map((c) => c.slice(1).map((x, i) => x / c[i]! - 1));
  const n = Math.max(0, dates.length - 1);
  const matrix = rets.map((ri, i) =>
    rets.map((rj, j) => (i === j ? 1 : n >= minObservations ? pearson(ri, rj) : null)),
  );
  return { symbols: named.map((x) => x.symbol), matrix, observations: n, start: dates[0] ?? null, end: dates[dates.length - 1] ?? null };
}

export interface BenchmarkComparison {
  assetReturn: number | null;
  benchmarkReturn: number | null;
  /** assetReturn − benchmarkReturn (arithmetic excess), not alpha in a regression sense. */
  excessReturn: number | null;
  observations: number;
  start: string | null;
  end: string | null;
}

/** Period return of asset vs benchmark over their common dates. */
export function compareToBenchmark(asset: readonly PricePoint[], benchmark: readonly PricePoint[]): BenchmarkComparison {
  const { dates, closes } = alignSeries([asset, benchmark]);
  if (dates.length < 2) {
    return { assetReturn: null, benchmarkReturn: null, excessReturn: null, observations: dates.length, start: null, end: null };
  }
  const last = dates.length - 1;
  const ar = closes[0]![last]! / closes[0]![0]! - 1;
  const br = closes[1]![last]! / closes[1]![0]! - 1;
  return { assetReturn: ar, benchmarkReturn: br, excessReturn: ar - br, observations: dates.length, start: dates[0]!, end: dates[last]! };
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

export function summarizeSeries(series: readonly PricePoint[]): SeriesSummary {
  const s = cleanSeries(series);
  const lastOf = <T extends { value: number | null }>(xs: T[]) => (xs.length ? xs[xs.length - 1]!.value : null);
  return {
    start: s[0]?.date ?? null,
    end: s[s.length - 1]?.date ?? null,
    observations: s.length,
    lastClose: s[s.length - 1]?.close ?? null,
    dailyChange: dailyChange(s),
    periodReturn: periodReturn(s),
    annualizedVolatility: annualizedVolatility(s),
    maxDrawdown: maxDrawdown(s)?.maxDrawdown ?? null,
    rsi14: s.length > 14 ? lastOf(rsi(s, 14)) : null,
    sma50: s.length >= 50 ? lastOf(sma(s, 50)) : null,
    sma200: s.length >= 200 ? lastOf(sma(s, 200)) : null,
  };
}
