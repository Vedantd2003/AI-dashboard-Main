import { describe, expect, it } from 'vitest';
import {
  annualizedVolatility,
  cleanSeries,
  compareToBenchmark,
  correlation,
  correlationMatrix,
  cumulativeReturns,
  dailyChange,
  drawdownSeries,
  ema,
  maxDrawdown,
  periodReturn,
  rollingVolatility,
  rsi,
  sampleStdDev,
  simpleReturns,
  sma,
  summarizeSeries,
  type PricePoint,
} from '../src/analytics.js';

const d = (i: number) => `2024-01-${String(i + 1).padStart(2, '0')}`;
const series = (closes: number[]): PricePoint[] => closes.map((close, i) => ({ date: d(i), close }));

const S = series([100, 110, 88, 120, 108]);

describe('cleanSeries', () => {
  it('sorts, drops invalid closes and duplicate dates (last wins)', () => {
    const raw: PricePoint[] = [
      { date: '2024-01-03', close: 3 },
      { date: '2024-01-01', close: 1 },
      { date: '2024-01-02', close: NaN },
      { date: '2024-01-02', close: -5 },
      { date: 'not-a-date', close: 9 },
      { date: '2024-01-03', close: 4 },
    ];
    expect(cleanSeries(raw)).toEqual([
      { date: '2024-01-01', close: 1 },
      { date: '2024-01-03', close: 4 },
    ]);
  });
});

describe('returns', () => {
  it('simple returns, daily change, period return', () => {
    const r = simpleReturns(S).map((x) => x.value);
    expect(r[0]).toBeCloseTo(0.1, 12);
    expect(r[1]).toBeCloseTo(-0.2, 12);
    expect(r[2]).toBeCloseTo(120 / 88 - 1, 12);
    expect(dailyChange(S)).toBeCloseTo(-0.1, 12);
    expect(periodReturn(S)).toBeCloseTo(0.08, 12);
  });
  it('cumulative returns start at 0', () => {
    const c = cumulativeReturns(S);
    expect(c[0]!.value).toBe(0);
    expect(c[4]!.value).toBeCloseTo(0.08, 12);
  });
  it('returns null on insufficient data', () => {
    expect(periodReturn(series([100]))).toBeNull();
    expect(dailyChange([])).toBeNull();
  });
  it('a missing observation is skipped, not interpolated', () => {
    const gap = [{ date: '2024-01-01', close: 100 }, { date: '2024-01-02', close: NaN }, { date: '2024-01-03', close: 110 }];
    expect(simpleReturns(gap)).toEqual([{ date: '2024-01-03', value: expect.closeTo(0.1, 12) }]);
  });
});

describe('volatility', () => {
  it('sample std dev uses n − 1', () => {
    expect(sampleStdDev([1, 2, 3, 4])).toBeCloseTo(1.2909944487, 9);
    expect(sampleStdDev([1])).toBeNull();
  });
  it('constant growth has zero volatility', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
    expect(annualizedVolatility(series(closes))).toBeCloseTo(0, 12);
  });
  it('annualizes by √252 and enforces a minimum sample', () => {
    const closes = Array.from({ length: 25 }, (_, i) => (i % 2 ? 101 : 100));
    const lr = Math.log(101 / 100);
    // log returns alternate ±lr; 24 returns → mean 0, sample var = 24·lr² / 23
    const expected = Math.sqrt((24 * lr * lr) / 23) * Math.sqrt(252);
    expect(annualizedVolatility(series(closes))).toBeCloseTo(expected, 12);
    expect(annualizedVolatility(series(closes.slice(0, 10)))).toBeNull();
  });
  it('rolling volatility is null until window fills', () => {
    const rv = rollingVolatility(S, 3);
    expect(rv.map((x) => x.value === null)).toEqual([true, true, false, false]);
    expect(() => rollingVolatility(S, 1)).toThrow();
  });
});

describe('moving averages', () => {
  it('SMA(3)', () => {
    const v = sma(S, 3).map((x) => x.value);
    expect(v[0]).toBeNull();
    expect(v[1]).toBeNull();
    expect(v[2]).toBeCloseTo(298 / 3, 12);
    expect(v[3]).toBeCloseTo(106, 12);
    expect(v[4]).toBeCloseTo(316 / 3, 12);
  });
  it('EMA(3) seeded with SMA, α = 0.5', () => {
    const v = ema(S, 3).map((x) => x.value);
    expect(v[2]).toBeCloseTo(298 / 3, 12);
    expect(v[3]).toBeCloseTo(0.5 * 120 + 0.5 * (298 / 3), 12);
    expect(v[4]).toBeCloseTo(0.5 * 108 + 0.5 * (0.5 * 120 + 0.5 * (298 / 3)), 12);
  });
});

describe('RSI (Wilder)', () => {
  it('hand-computed period 2', () => {
    const v = rsi(series([1, 2, 1, 2]), 2).map((x) => x.value);
    expect(v[0]).toBeNull();
    expect(v[1]).toBeNull();
    expect(v[2]).toBeCloseTo(50, 12);
    expect(v[3]).toBeCloseTo(75, 12);
  });
  it('only gains → 100; flat → 50', () => {
    expect(rsi(series([1, 2, 3, 4, 5]), 2).at(-1)!.value).toBe(100);
    expect(rsi(series([5, 5, 5, 5]), 2).at(-1)!.value).toBe(50);
  });
});

describe('drawdown', () => {
  it('max drawdown with peak, trough, recovery', () => {
    const r = maxDrawdown(S)!;
    expect(r.maxDrawdown).toBeCloseTo(88 / 110 - 1, 12);
    expect(r.peakDate).toBe(d(1));
    expect(r.troughDate).toBe(d(2));
    expect(r.recoveryDate).toBe(d(3));
  });
  it('monotonic rise has zero drawdown', () => {
    expect(maxDrawdown(series([1, 2, 3]))!.maxDrawdown).toBe(0);
  });
  it('unrecovered drawdown has null recovery', () => {
    expect(maxDrawdown(series([10, 5, 6]))!.recoveryDate).toBeNull();
  });
  it('drawdown series', () => {
    expect(drawdownSeries(S).map((x) => x.value)[4]).toBeCloseTo(-0.1, 12);
  });
});

describe('correlation', () => {
  const a = series([100, 102, 99, 104, 101, 107]);
  it('scaled series correlate at +1', () => {
    const b = a.map((p) => ({ ...p, close: p.close * 3 }));
    expect(correlation(a, b, 2).value).toBeCloseTo(1, 12);
  });
  it('uses only common dates and reports the period', () => {
    const b = series([50, 51, 49.5, 52, 50.5]); // one fewer day
    const r = correlation(a, b, 2);
    expect(r.observations).toBe(4);
    expect(r.start).toBe(d(0));
    expect(r.end).toBe(d(4));
  });
  it('refuses with too few observations', () => {
    const r = correlation(a, a);
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/needs ≥ 20/);
  });
  it('matrix diagonal is 1', () => {
    const m = correlationMatrix([{ symbol: 'A', series: a }, { symbol: 'B', series: a }], 2);
    expect(m.matrix[0]![0]).toBe(1);
    expect(m.matrix[0]![1]).toBeCloseTo(1, 12);
  });
});

describe('benchmark & summary', () => {
  it('excess return over common dates', () => {
    const r = compareToBenchmark(series([100, 110]), series([200, 210]));
    expect(r.assetReturn).toBeCloseTo(0.1, 12);
    expect(r.benchmarkReturn).toBeCloseTo(0.05, 12);
    expect(r.excessReturn).toBeCloseTo(0.05, 12);
  });
  it('summary withholds indicators without enough data', () => {
    const s = summarizeSeries(S);
    expect(s.observations).toBe(5);
    expect(s.sma50).toBeNull();
    expect(s.rsi14).toBeNull();
    expect(s.annualizedVolatility).toBeNull();
    expect(s.lastClose).toBe(108);
  });
});
