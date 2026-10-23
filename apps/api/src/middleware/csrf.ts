import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

export const CSRF_HEADER = 'x-alphapulse-csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * State-changing requests must carry `X-AlphaPulse-CSRF: 1` (a custom header forces a CORS preflight, which our CORS
 * policy rejects for foreign origins) and, when an Origin header is present, it must equal one of the allowed origins.
 * Signed webhook routes are exempt (they authenticate with HMAC instead of cookies).
 */
export function csrfProtection(allowedOrigins: string[], exemptPrefixes: string[] = []) {
  const allowed = new Set(allowedOrigins.map((o) => o.replace(/\/$/, '')));
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE.has(req.method)) return next();
    if (exemptPrefixes.some((p) => req.path.startsWith(p))) return next();
    if (req.get(CSRF_HEADER) !== '1') return next(new AppError(403, 'csrf_failed', 'Missing CSRF header'));
    const origin = req.get('origin');
    if (origin && !allowed.has(origin.replace(/\/$/, ''))) return next(new AppError(403, 'csrf_failed', 'Origin not allowed'));
    next();
  };
}
