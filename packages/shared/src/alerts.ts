/**
 * Alert trigger rules.
 *
 * - price_above:  triggers when lastPrice ≥ threshold
 * - price_below:  triggers when lastPrice ≤ threshold
 * - pct_move:     triggers when |lastPrice / referencePrice − 1| ≥ threshold/100
 *                 referencePrice is the previous close supplied by the provider.
 *
 * Duplicate prevention: an alert fires at most once per `cooldownMinutes` (default 24h) AND
 * once per (alertId, rule window) idempotency key — the key is stored with a unique index,
 * so concurrent evaluators cannot both record the same event.
 */

export type AlertRuleType = 'price_above' | 'price_below' | 'pct_move';

export interface AlertRule {
  type: AlertRuleType;
  threshold: number;
  cooldownMinutes?: number;
}

export interface AlertQuoteInput {
  price: number | null;
  previousClose: number | null;
}

export interface AlertEvaluation {
  triggered: boolean;
  reason: string;
  observed: number | null;
}

export function evaluateAlertRule(rule: AlertRule, q: AlertQuoteInput): AlertEvaluation {
  if (q.price === null || !Number.isFinite(q.price)) {
    return { triggered: false, reason: 'no price available', observed: null };
  }
  switch (rule.type) {
    case 'price_above':
      return {
        triggered: q.price >= rule.threshold,
        reason: `price ${q.price} ${q.price >= rule.threshold ? '≥' : '<'} ${rule.threshold}`,
        observed: q.price,
      };
    case 'price_below':
      return {
        triggered: q.price <= rule.threshold,
        reason: `price ${q.price} ${q.price <= rule.threshold ? '≤' : '>'} ${rule.threshold}`,
        observed: q.price,
      };
    case 'pct_move': {
      if (q.previousClose === null || !Number.isFinite(q.previousClose) || q.previousClose <= 0) {
        return { triggered: false, reason: 'no previous close available', observed: null };
      }
      const move = (q.price / q.previousClose - 1) * 100;
      return {
        triggered: Math.abs(move) >= rule.threshold,
        reason: `move ${move.toFixed(2)}% vs threshold ±${rule.threshold}%`,
        observed: move,
      };
    }
  }
}

export function isInCooldown(lastTriggeredAt: Date | null | undefined, cooldownMinutes: number, now: Date = new Date()): boolean {
  if (!lastTriggeredAt) return false;
  return now.getTime() - lastTriggeredAt.getTime() < cooldownMinutes * 60_000;
}

/** Idempotency key: one event per alert per cooldown bucket. */
export function alertEventKey(alertId: string, cooldownMinutes: number, now: Date = new Date()): string {
  const bucket = Math.floor(now.getTime() / (Math.max(1, cooldownMinutes) * 60_000));
  return `${alertId}:${bucket}`;
}
