import { alertEventKey, evaluateAlertRule, isInCooldown } from '@alphapulse/shared';
import type { Deps } from '../deps.js';
import { Alert, AlertEvent } from '../models/index.js';
import type { MarketService } from './markets.js';
import type { NotificationService } from './notifications.js';

export interface AlertRunMetrics {
  evaluated: number;
  symbols: number;
  triggered: number;
  suppressedByCooldown: number;
  duplicates: number;
  quoteErrors: number;
}

/**
 * Evaluates all active alerts. One quote per distinct symbol.
 * Duplicate prevention is two-layered: cooldown on the alert document AND a unique idempotency key on alertEvents,
 * so two concurrent evaluators cannot both create (and notify) the same event.
 */
export async function evaluateAllAlerts(deps: Deps, markets: MarketService, notifications: NotificationService, userId?: string): Promise<AlertRunMetrics> {
  const filter: Record<string, unknown> = { active: true };
  if (userId) filter.userId = userId;
  const alerts = await Alert.find(filter).limit(5000);
  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const metrics: AlertRunMetrics = { evaluated: 0, symbols: symbols.length, triggered: 0, suppressedByCooldown: 0, duplicates: 0, quoteErrors: 0 };
  if (!alerts.length) return metrics;

  const quotes = new Map((await markets.quotes(symbols)).map((q) => [q.symbol, q]));
  const now = deps.now();

  for (const a of alerts) {
    const q = quotes.get(a.symbol);
    metrics.evaluated++;
    if (!q?.quote) {
      metrics.quoteErrors++;
      a.lastEvaluatedAt = now;
      a.lastEvaluation = `quote unavailable: ${q?.error ?? 'unknown'}`;
      await a.save();
      continue;
    }
    const ev = evaluateAlertRule({ type: a.type, threshold: a.threshold }, { price: q.quote.price, previousClose: q.quote.previousClose });
    a.lastEvaluatedAt = now;
    a.lastEvaluation = ev.reason;
    if (!ev.triggered) {
      await a.save();
      continue;
    }
    if (isInCooldown(a.lastTriggeredAt, a.cooldownMinutes, now)) {
      metrics.suppressedByCooldown++;
      await a.save();
      continue;
    }
    const key = alertEventKey(String(a._id), a.cooldownMinutes, now);
    try {
      await AlertEvent.create({
        alertId: a._id,
        userId: a.userId,
        idempotencyKey: key,
        symbol: a.symbol,
        observed: ev.observed,
        reason: ev.reason,
        quoteAsOf: q.quote.asOf ? new Date(q.quote.asOf) : null,
        provider: q.quote.provider,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        metrics.duplicates++;
        await a.save();
        continue;
      }
      throw e;
    }
    a.lastTriggeredAt = now;
    await a.save();
    metrics.triggered++;
    const label = a.type === 'pct_move' ? `moved ±${a.threshold}%` : a.type === 'price_above' ? `rose to ≥ ${a.threshold}` : `fell to ≤ ${a.threshold}`;
    await notifications.notify({
      userId: a.userId,
      kind: 'alert_triggered',
      title: `${a.symbol} ${label}`,
      body: `${ev.reason}. Quote from ${q.quote.provider}${q.quote.asOf ? ` as of ${q.quote.asOf}` : ''} (${q.quote.freshness}).`,
      link: `/app/markets/${encodeURIComponent(a.symbol)}`,
      dedupeKey: `alert:${key}`,
      channels: a.channels as ('in_app' | 'email' | 'webhook')[],
    });
  }
  return metrics;
}
