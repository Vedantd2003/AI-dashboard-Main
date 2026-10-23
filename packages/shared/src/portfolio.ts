/**
 * Hypothetical portfolio valuation. Educational only — not brokerage positions, no tax computation.
 *
 * positionValue = quantity × lastPrice                      (null when no price)
 * costBasis     = quantity × averageCost
 * unrealizedPnL = positionValue − costBasis                  (null when no price)
 * weight_i      = positionValue_i / Σ valued positions        (unvalued positions excluded and listed)
 * HHI           = Σ weight_i²   (1/n for equal weights, 1 for a single holding)
 *
 * Currencies are never mixed: totals are computed per currency. No FX conversion is performed.
 */

export interface PositionInput {
  symbol: string;
  quantity: number;
  averageCost: number;
  currency: string;
}

export interface PositionValuation extends PositionInput {
  lastPrice: number | null;
  value: number | null;
  costBasis: number;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  weight: number | null;
  status: 'valued' | 'no_price';
}

export interface CurrencyTotals {
  currency: string;
  value: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number | null;
  hhi: number | null;
  topWeight: number | null;
  valuedPositions: number;
}

export function valuePortfolio(
  positions: readonly PositionInput[],
  prices: Readonly<Record<string, number | null | undefined>>,
): { positions: PositionValuation[]; totals: CurrencyTotals[]; unvalued: string[] } {
  const rows: PositionValuation[] = positions.map((p) => {
    const px = prices[p.symbol];
    const lastPrice = typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : null;
    const costBasis = p.quantity * p.averageCost;
    const value = lastPrice === null ? null : p.quantity * lastPrice;
    const pnl = value === null ? null : value - costBasis;
    return {
      ...p,
      lastPrice,
      value,
      costBasis,
      unrealizedPnL: pnl,
      unrealizedPnLPct: pnl === null || costBasis === 0 ? null : pnl / costBasis,
      weight: null,
      status: lastPrice === null ? 'no_price' : 'valued',
    };
  });

  const currencies = [...new Set(rows.map((r) => r.currency))];
  const totals: CurrencyTotals[] = currencies.map((cur) => {
    const valued = rows.filter((r) => r.currency === cur && r.value !== null);
    const value = valued.reduce((s, r) => s + (r.value as number), 0);
    const costBasis = valued.reduce((s, r) => s + r.costBasis, 0);
    for (const r of valued) r.weight = value > 0 ? (r.value as number) / value : null;
    const weights = valued.map((r) => r.weight).filter((w): w is number => w !== null);
    return {
      currency: cur,
      value,
      costBasis,
      unrealizedPnL: value - costBasis,
      unrealizedPnLPct: costBasis > 0 ? (value - costBasis) / costBasis : null,
      hhi: weights.length ? weights.reduce((s, w) => s + w * w, 0) : null,
      topWeight: weights.length ? Math.max(...weights) : null,
      valuedPositions: valued.length,
    };
  });

  return { positions: rows, totals, unvalued: rows.filter((r) => r.status === 'no_price').map((r) => r.symbol) };
}

/**
 * Historical value of a buy-and-hold hypothetical portfolio: V_t = Σ q_i × P_i,t over dates where ALL
 * positions (same currency) have a price. Purchase dates are ignored (constant quantities) — documented assumption.
 */
export function historicalPortfolioValue(
  positions: readonly { symbol: string; quantity: number }[],
  closesBySymbol: Readonly<Record<string, readonly { date: string; close: number }[]>>,
): { date: string; close: number }[] {
  if (!positions.length) return [];
  const maps = positions.map((p) => new Map((closesBySymbol[p.symbol] ?? []).map((x) => [x.date.slice(0, 10), x.close])));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return dates.map((d) => ({ date: d, close: positions.reduce((s, p, i) => s + p.quantity * maps[i]!.get(d)!, 0) }));
}
