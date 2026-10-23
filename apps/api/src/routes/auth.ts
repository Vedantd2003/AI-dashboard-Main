import { Router, type Response } from 'express';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { body } from '../lib/validate.js';
import { notConfigured } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import { User } from '../models/index.js';
import { audit } from '../services/audit.js';
import {
  SESSION_COOKIE,
  authenticate,
  consumeAuthToken,
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  issueAuthToken,
  registerUser,
  verifyPassword,
} from '../services/auth.js';

export function publicUser(u: { _id: unknown; email: string; name: string; role: string; emailVerifiedAt?: Date | null; timezone?: string; dashboardWidgets?: string[]; notificationPrefs?: unknown; createdAt?: Date }) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: !!u.emailVerifiedAt,
    timezone: u.timezone,
    dashboardWidgets: u.dashboardWidgets,
    notificationPrefs: u.notificationPrefs,
    createdAt: u.createdAt,
  };
}

export function authRouter(ctx: AppContext) {
  const r = Router();
  const { config } = ctx.deps;
  const setCookie = (res: Response, token: string, maxAgeMs: number) =>
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge: maxAgeMs });
  const clearCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' });

  const sendVerification = async (userId: Parameters<typeof issueAuthToken>[0], email: string) => {
    if (!ctx.deps.email) return false;
    const token = await issueAuthToken(userId, 'verify_email', 24 * 3600_000);
    await ctx.deps.email.send({
      to: email,
      subject: 'Verify your AlphaPulse email',
      text: `Confirm your email address: ${config.APP_BASE_URL}/verify-email?token=${token}\n\nThis link expires in 24 hours.`,
    });
    return true;
  };

  r.post('/register', ctx.limits.auth, async (req, res) => {
    const input = body(req, registerSchema);
    const user = await registerUser(input);
    const { token, maxAgeMs } = await createSession(user._id, req.get('user-agent'));
    setCookie(res, token, maxAgeMs);
    await audit('auth.register', { userId: user._id, req });
    let verificationSent = false;
    try {
      verificationSent = await sendVerification(user._id, user.email);
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'verification email failed');
    }
    res.status(201).json({ user: publicUser(user), verificationSent, emailConfigured: !!ctx.deps.email });
  });

  r.post('/login', ctx.limits.auth, async (req, res) => {
    const { email, password } = body(req, loginSchema);
    const user = await authenticate(email, password).catch(async (e) => {
      await audit('auth.login_failed', { req, meta: { emailDomain: email.split('@')[1] } });
      throw e;
    });
    const { token, maxAgeMs } = await createSession(user._id, req.get('user-agent'));
    setCookie(res, token, maxAgeMs);
    await audit('auth.login', { userId: user._id, req });
    res.json({ user: publicUser(user) });
  });

  r.post('/logout', async (req, res) => {
    if (req.sessionToken) await destroySession(req.sessionToken);
    if (req.user) await audit('auth.logout', { userId: req.user._id, req });
    clearCookie(res);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(me(req)) });
  });

  r.post('/verify-email/request', requireAuth, ctx.limits.auth, async (req, res) => {
    if (!ctx.deps.email) throw notConfigured('Email', 'Set RESEND_API_KEY and EMAIL_FROM to enable email verification.');
    await sendVerification(me(req)._id, me(req).email);
    res.json({ ok: true });
  });

  r.post('/verify-email/confirm', async (req, res) => {
    const { token } = body(req, resetPasswordSchema.pick({ token: true }));
    const userId = await consumeAuthToken(token, 'verify_email');
    await User.updateOne({ _id: userId }, { emailVerifiedAt: new Date() });
    await audit('auth.email_verified', { userId, req });
    res.json({ ok: true });
  });

  /** Always responds 200 to avoid account enumeration. */
  r.post('/password/forgot', ctx.limits.auth, async (req, res) => {
    const { email } = body(req, forgotPasswordSchema);
    if (!ctx.deps.email) {
      return res.json({ ok: true, emailConfigured: false, message: 'Email delivery is not configured. Contact the administrator to recover your account.' });
    }
    const user = await User.findOne({ email });
    if (user) {
      const token = await issueAuthToken(user._id, 'reset_password', 3600_000);
      await ctx.deps.email
        .send({ to: user.email, subject: 'Reset your AlphaPulse password', text: `Reset your password: ${config.APP_BASE_URL}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.` })
        .catch((e) => req.log.warn({ err: (e as Error).message }, 'reset email failed'));
      await audit('auth.password_reset_requested', { userId: user._id, req });
    }
    res.json({ ok: true, emailConfigured: true });
  });

  r.post('/password/reset', ctx.limits.auth, async (req, res) => {
    const { token, password } = body(req, resetPasswordSchema);
    const userId = await consumeAuthToken(token, 'reset_password');
    await User.updateOne({ _id: userId }, { passwordHash: await hashPassword(password) });
    await destroyAllSessions(userId);
    await audit('auth.password_reset', { userId, req });
    clearCookie(res);
    res.json({ ok: true });
  });

  r.post('/password/change', requireAuth, ctx.limits.auth, async (req, res) => {
    const { currentPassword, newPassword } = body(req, changePasswordSchema);
    const u = await User.findById(me(req)._id).select('+passwordHash');
    if (!u || !(await verifyPassword(u.passwordHash, currentPassword))) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Current password is incorrect' } });
    }
    u.passwordHash = await hashPassword(newPassword);
    await u.save();
    await destroyAllSessions(u._id);
    const { token, maxAgeMs } = await createSession(u._id, req.get('user-agent'));
    setCookie(res, token, maxAgeMs);
    await audit('auth.password_changed', { userId: u._id, req });
    res.json({ ok: true });
  });

  return r;
}
