import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { AppContext } from './context.js';
import { loadSession } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { buildOpenApi } from './openapi.js';
import { adminRouter } from './routes/admin.js';
import { alertsRouter, notificationsRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { marketsRouter } from './routes/markets.js';
import { portfoliosRouter } from './routes/portfolios.js';
import { reportsRouter, researchRouter } from './routes/research.js';
import { settingsRouter } from './routes/settings.js';
import { watchlistsRouter } from './routes/watchlists.js';
import { automationsRouter, n8nHookRouter } from './routes/workflows.js';

export function createApp(ctx: AppContext) {
  const { config, logger } = ctx.deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.set('query parser', 'simple'); // no nested objects from query strings (NoSQL-injection hardening)
  // Operator injection is prevented by strict Zod schemas (strings stay strings) and the flat query parser;
  // a global sanitizeFilter would also neuter the server's own $gt/$in queries.

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' }, customProps: (req) => ({ userId: (req as express.Request).user?._id?.toString() }) }));
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'https:'] } } }));
  const origins = [config.APP_BASE_URL];
  app.use(cors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-AlphaPulse-CSRF'] }));
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  const api = Router();

  // Health is cheap and unauthenticated; it reports configuration presence, never values.
  api.get('/health', async (_req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    let dbPingMs: number | null = null;
    if (dbState === 'connected') {
      const t0 = Date.now();
      await mongoose.connection.db?.admin().ping().catch(() => null);
      dbPingMs = Date.now() - t0;
    }
    const i = config.integrations;
    res.status(dbState === 'connected' ? 200 : 503).json({
      status: dbState === 'connected' ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev',
      database: { state: dbState, pingMs: dbPingMs },
      integrations: {
        marketData: i.marketData ? 'configured' : 'not_configured',
        newsAndFundamentals: i.news ? 'configured' : 'not_configured',
        secFilings: i.filings ? 'configured' : 'not_configured',
        llm: i.llm ? 'configured' : 'not_configured',
        email: i.email ? 'configured' : 'not_configured',
        n8n: i.n8n ? 'configured' : 'not_configured',
        queue: ctx.dispatcher.mode,
        scheduler: ctx.scheduler ? 'enabled' : 'disabled',
      },
    });
  });

  const spec = buildOpenApi(config.API_PUBLIC_URL ?? '');
  api.get('/openapi.json', (_req, res) => res.json(spec));
  api.use('/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'AlphaPulse API' }));

  api.use(loadSession);
  api.use(ctx.limits.global);
  api.use(csrfProtection(origins, ['/hooks/']));

  api.use('/auth', authRouter(ctx));
  api.use('/', settingsRouter(ctx));
  api.use('/markets', marketsRouter(ctx));
  api.use('/watchlists', watchlistsRouter(ctx));
  api.use('/portfolios', portfoliosRouter(ctx));
  api.use('/alerts', alertsRouter(ctx));
  api.use('/notifications', notificationsRouter(ctx));
  api.use('/research', researchRouter(ctx));
  api.use('/reports', reportsRouter(ctx));
  api.use('/automations', automationsRouter(ctx));
  api.use('/hooks/n8n', n8nHookRouter(ctx));
  api.use('/admin', adminRouter(ctx));

  app.use('/api/v1', api);
  app.get('/', (_req, res) => res.json({ name: 'AlphaPulse AI API', docs: '/api/v1/docs', health: '/api/v1/health' }));
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
