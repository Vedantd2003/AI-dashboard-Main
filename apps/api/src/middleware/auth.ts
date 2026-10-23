import type { NextFunction, Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { UserDoc } from '../models/user.js';
import { resolveSession, SESSION_COOKIE } from '../services/auth.js';

/** Attaches req.user if a valid session cookie is present. Never trusts user ids from the request. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    const r = await resolveSession(token);
    if (r) {
      req.user = r.user as unknown as HydratedDocument<UserDoc>;
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Administrator access required'));
  next();
}

/** The authenticated user (only call after requireAuth). */
export const me = (req: Request) => req.user!;
