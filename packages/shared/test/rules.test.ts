import { describe, expect, it } from 'vitest';
import { alertEventKey, evaluateAlertRule, isInCooldown } from '../src/alerts.js';
import { validateClaims } from '../src/citations.js';
import { canonicalUrl, dedupeSources, jaccard, rankSources } from '../src/dedupe.js';
import { historicalPortfolioValue, valuePortfolio } from '../src/portfolio.js';
import { llmReportSchema, researchRequestSchema, alertCreateSchema, registerSchema } from '../src/schemas.js';
import { normalizeSymbols } from '../src/symbols.js';

describe('alert rules', () => {
  it('price thresholds', () => {
    expect(evaluateAlertRule({ type: 'price_above', threshold: 100 }, { price: 100, previousClose: 90 }).triggered).toBe(true);
    expect(evaluateAlertRule({ type: 'price_above', threshold: 100 }, { price: 99.99, previousClose: 90 }).triggered).toBe(false);
    expect(evaluateAlertRule({ type: 'price_below', threshold: 50 }, { price: 49, previousClose: 60 }).triggered).toBe(true);
  });
  it('percent move is symmetric and needs a previous close', () => {
    expect(evaluateAlertRule({ type: 'pct_move', threshold: 5 }, { price: 94, previousClose: 100 }).triggered).toBe(true);
    expect(evaluateAlertRule({ type: 'pct_move', threshold: 5 }, { price: 104, previousClose: 100 }).triggered).toBe(false);
    expect(evaluateAlertRule({ type: 'pct_move', threshold: 5 }, { price: 120, previousClose: null }).triggered).toBe(false);
  });
  it('never triggers without a price', () => {
    expect(evaluateAlertRule({ type: 'price_below', threshold: 50 }, { price: null, previousClose: 60 })).toMatchObject({
      triggered: false,
      reason: 'no price available',
    });
  });
  it('cooldown and idempotency key bucket', () => {
    const now = new Date('2024-06-01T12:00:00Z');
    expect(isInCooldown(new Date('2024-06-01T11:30:00Z'), 60, now)).toBe(true);
    expect(isInCooldown(new Date('2024-06-01T10:00:00Z'), 60, now)).toBe(false);
    expect(alertEventKey('a1', 60, now)).toBe(alertEventKey('a1', 60, new Date('2024-06-01T12:59:59Z')));
    expect(alertEventKey('a1', 60, now)).not.toBe(alertEventKey('a1', 60, new Date('2024-06-01T13:00:00Z')));
  });
});

describe('dedupe & ranking', () => {
  it('canonicalizes URLs', () => {
    expect(canonicalUrl('http://WWW.Example.com/a/?utm_source=x&b=2&a=1#frag')).toBe('https://example.com/a?a=1&b=2');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });
  it('removes same-URL and syndicated-title duplicates, keeping first', () => {
    const src = [
      { id: '1', url: 'https://a.com/x?utm_medium=y', title: 'Apple reports record quarterly revenue on iPhone demand', kind: 'primary' as const },
      { id: '2', url: 'https://a.com/x', title: 'Different', kind: 'secondary' as const },
      { id: '3', url: 'https://b.com/y', title: 'Apple reports record quarterly revenue on iPhone demand - Wire', kind: 'secondary' as const },
      { id: '4', url: 'https://c.com/z', title: 'Microsoft cloud growth slows', kind: 'secondary' as const },
    ];
    expect(dedupeSources(src).map((s) => s.id)).toEqual(['1', '4']);
    expect(jaccard('a b c d', 'a b c d')).toBe(1);
  });
  it('ranks recent primary sources first', () => {
    const now = new Date('2024-06-10T00:00:00Z');
    const ranked = rankSources(
      [
        { id: 'old', url: 'https://x/1', title: 'a', kind: 'secondary', publishedAt: '2024-05-01T00:00:00Z' },
        { id: 'new', url: 'https://x/2', title: 'b', kind: 'secondary', publishedAt: '2024-06-09T00:00:00Z' },
        { id: 'filing', url: 'https://x/3', title: 'c', kind: 'primary', publishedAt: '2024-06-09T00:00:00Z' },
      ],
      [],
      now,
    );
    expect(ranked.map((s) => s.id)).toEqual(['filing', 'new', 'old']);
  });
});

describe('citation validation', () => {
  const sources = [{ id: 'S1', text: 'Apple Inc. reported quarterly revenue of $94.9 billion, up 6 percent year over year.' }];
  it('keeps citations whose passage exists in the source', () => {
    const r = validateClaims(
      [{ text: 'Revenue grew 6%.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'revenue of $94.9 billion, up 6 percent' }] }],
      sources,
    );
    expect(r.claims[0]!.basis).toBe('source_reported');
    expect(r.stats.verified).toBe(1);
  });
  it('downgrades fabricated evidence or unknown source ids to unverified', () => {
    const r = validateClaims(
      [
        { text: 'Revenue grew 20%.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'revenue grew 20 percent to a record' }] },
        { text: 'Margins expanded.', basis: 'source_reported', citations: [{ sourceId: 'S9', evidence: 'quarterly revenue of $94.9 billion' }] },
      ],
      sources,
    );
    expect(r.claims.map((c) => c.basis)).toEqual(['unverified', 'unverified']);
    expect(r.claims.every((c) => c.citations.length === 0)).toBe(true);
    expect(r.stats).toMatchObject({ downgraded: 2, droppedCitations: 2 });
  });
  it('interpretations may stand without citations', () => {
    const r = validateClaims([{ text: 'Momentum appears mixed.', basis: 'interpretation', citations: [] }], sources);
    expect(r.claims[0]!.basis).toBe('interpretation');
  });
  it('rejects too-short evidence snippets', () => {
    const r = validateClaims([{ text: 'x', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'Apple' }] }], sources);
    expect(r.claims[0]!.basis).toBe('unverified');
  });
});

describe('portfolio valuation', () => {
  it('values positions, excludes unpriced, never mixes currencies', () => {
    const r = valuePortfolio(
      [
        { symbol: 'AAA', quantity: 10, averageCost: 50, currency: 'USD' },
        { symbol: 'BBB', quantity: 5, averageCost: 100, currency: 'USD' },
        { symbol: 'CCC', quantity: 1, averageCost: 10, currency: 'USD' },
        { symbol: 'INF', quantity: 2, averageCost: 1000, currency: 'INR' },
      ],
      { AAA: 60, BBB: 120, CCC: null, INF: 1100 },
    );
    const usd = r.totals.find((t) => t.currency === 'USD')!;
    expect(usd.value).toBe(1200);
    expect(usd.costBasis).toBe(1000); // CCC excluded because unvalued
    expect(usd.unrealizedPnL).toBe(200);
    expect(usd.hhi).toBeCloseTo(0.5 ** 2 + 0.5 ** 2, 12);
    expect(r.unvalued).toEqual(['CCC']);
    expect(r.positions.find((p) => p.symbol === 'CCC')!.value).toBeNull();
    expect(r.totals.find((t) => t.currency === 'INR')!.value).toBe(2200);
  });
  it('historical value uses common dates only', () => {
    const h = historicalPortfolioValue(
      [{ symbol: 'A', quantity: 2 }, { symbol: 'B', quantity: 1 }],
      { A: [{ date: '2024-01-01', close: 10 }, { date: '2024-01-02', close: 11 }], B: [{ date: '2024-01-02', close: 5 }] },
    );
    expect(h).toEqual([{ date: '2024-01-02', close: 27 }]);
  });
});

describe('schemas', () => {
  it('normalizes symbols', () => {
    expect(normalizeSymbols([' aapl', 'brk.b', 'AAPL', 'bad sym!'])).toEqual({ valid: ['AAPL', 'BRK.B'], invalid: ['bad sym!'] });
  });
  it('research request validation', () => {
    expect(researchRequestSchema.safeParse({ question: 'What changed this week?', symbols: ['msft'] }).success).toBe(true);
    expect(researchRequestSchema.safeParse({ question: 'short', symbols: [] }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ question: 'Compare these firms', symbols: ['A', 'B', 'C', 'D', 'E', 'F'] }).success).toBe(false);
  });
  it('rejects NoSQL operator objects where strings are expected', () => {
    expect(registerSchema.safeParse({ email: { $gt: '' }, password: 'abcdefghij1', name: 'x' }).success).toBe(false);
  });
  it('alert percent threshold capped', () => {
    expect(alertCreateSchema.safeParse({ symbol: 'AAPL', type: 'pct_move', threshold: 150 }).success).toBe(false);
  });
  it('LLM output schema rejects probability-style confidence', () => {
    const base = {
      executiveSummary: 's',
      keyFindings: [],
      bullishFactors: [],
      bearishFactors: [],
      risks: [],
      uncertainties: [],
      followUpQuestions: [],
      limitations: [],
    };
    expect(llmReportSchema.safeParse({ ...base, evidenceStrength: 'moderate' }).success).toBe(true);
    expect(llmReportSchema.safeParse({ ...base, evidenceStrength: 0.87 }).success).toBe(false);
  });
});
