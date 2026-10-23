import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { Types } from 'mongoose';
import { AuthToken, Session, User } from '../models/index.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError, conflict, unauthorized } from '../lib/errors.js';

/** OWASP minimum for Argon2id: m=19 MiB, t=2, p=1. */
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const SESSION_COOKIE = 'ap_session';
export const SESSION_IDLE_MS = 7 * 24 * 3600_000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 3600_000;

export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

// Used to equalize timing for unknown emails.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing-1'));

export async function registerUser(input: { email: string; password: string; name: string }) {
  const exists = await User.exists({ email: input.email });
  if (exists) throw conflict('An account with this email already exists');
  const passwordHash = await hashPassword(input.password);
  const isFirstUser = (await User.estimatedDocumentCount()) === 0;
  // The very first account becomes admin so a fresh deployment can be administered; documented in README.
  return User.create({
    email: input.email,
    name: input.name,
    passwordHash,
    role: isFirstUser ? 'admin' : 'user',
    unsubscribeToken: randomToken(18),
  });
}

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    throw unauthorized('Invalid email or password');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw unauthorized('Invalid email or password');
  return user;
}

export async function createSession(userId: Types.ObjectId, userAgent?: string, now = new Date()) {
  const token = randomToken(32);
  await Session.create({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    userAgent: userAgent?.slice(0, 300),
  });
  return { token, maxAgeMs: SESSION_IDLE_MS };
}

/** Resolves a session token and slides idle expiry (at most once per hour to limit writes). */
export async function resolveSession(token: string, now = new Date()) {
  if (!token || token.length > 100) return null;
  const s = await Session.findOne({ tokenHash: sha256(token) });
  if (!s) return null;
  if (s.expiresAt <= now || s.absoluteExpiresAt <= now) {
    await s.deleteOne();
    return null;
  }
  const user = await User.findById(s.userId);
  if (!user) {
    await s.deleteOne();
    return null;
  }
  if (s.expiresAt.getTime() - now.getTime() < SESSION_IDLE_MS - 3600_000) {
    s.expiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, s.absoluteExpiresAt.getTime()));
    await s.save();
  }
  return { user, session: s };
}

export const destroySession = (token: string) => Session.deleteOne({ tokenHash: sha256(token) });
export const destroyAllSessions = (userId: Types.ObjectId) => Session.deleteMany({ userId });

export async function issueAuthToken(userId: Types.ObjectId, purpose: 'verify_email' | 'reset_password', ttlMs = 3600_000) {
  const token = randomToken(32);
  await AuthToken.create({ tokenHash: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

export async function consumeAuthToken(token: string, purpose: 'verify_email' | 'reset_password') {
  const t = await AuthToken.findOneAndUpdate(
    { tokenHash: sha256(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!t) throw new AppError(400, 'invalid_token', 'This link is invalid or has expired');
  return t.userId;
}
