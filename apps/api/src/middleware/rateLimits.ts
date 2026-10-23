import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';

const json = (message: string) => ({ error: { code: 'rate_limited', message } });
const userOrIp = (req: Request) => (req.user ? `u:${req.user._id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`);

export interface Limiters {
  global: RateLimitRequestHandler;
  auth: RateLimitRequestHandler;
  expensive: RateLimitRequestHandler;
  market: RateLimitRequestHandler;
}

/**
 * Created per app instance (in-memory store, single instance — documented).
 * `scale` multiplies limits; tests use a large scale so assertions are not order-dependent.
 */
export function createLimiters(scale = 1): Limiters {
  const base = { standardHeaders: 'draft-8' as const, legacyHeaders: false };
  return {
    /** Keyed by user when signed in: behind the web proxy many users share one upstream IP. */
    global: rateLimit({ ...base, windowMs: 60_000, limit: 300 * scale, keyGenerator: userOrIp, message: json('Too many requests') }),
    auth: rateLimit({
      ...base,
      windowMs: 15 * 60_000,
      limit: 10 * scale,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').toLowerCase().slice(0, 254)}`,
      message: json('Too many attempts. Try again in 15 minutes.'),
    }),
    /** Research and workflow runs cost money (LLM + provider credits). */
    expensive: rateLimit({ ...base, windowMs: 60_000, limit: 3 * scale, keyGenerator: userOrIp, message: json('Please wait a minute before starting another run.') }),
    market: rateLimit({ ...base, windowMs: 60_000, limit: 60 * scale, keyGenerator: userOrIp, message: json('Too many market data requests') }),
  };
}
