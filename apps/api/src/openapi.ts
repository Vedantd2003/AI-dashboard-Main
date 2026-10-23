import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  alertCreateSchema,
  alertUpdateSchema,
  loginSchema,
  portfolioCreateSchema,
  registerSchema,
  researchRequestSchema,
  updateSettingsSchema,
  watchlistCreateSchema,
  watchlistItemSchema,
  workflowUpdateSchema,
} from '@alphapulse/shared';

const js = (s: Parameters<typeof zodToJsonSchema>[0]) => {
  const { $schema: _drop, ...rest } = zodToJsonSchema(s, { target: 'openApi3' }) as Record<string, unknown>;
  return rest;
};

type Op = { summary: string; tags: string[]; auth?: 'session' | 'admin' | 'hmac' | 'none'; body?: unknown; params?: string[]; query?: Record<string, string>; responses?: Record<string, string> };

const P = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string' } });
const Q = (name: string, description: string) => ({ name, in: 'query', required: false, schema: { type: 'string' }, description });

function op(o: Op) {
  const security = o.auth === 'none' ? [] : o.auth === 'hmac' ? [{ n8nSignature: [] }] : [{ session: [], csrf: [] }];
  return {
    summary: o.summary + (o.auth === 'admin' ? ' (admin)' : ''),
    tags: o.tags,
    security,
    parameters: [...(o.params ?? []).map(P), ...Object.entries(o.query ?? {}).map(([k, d]) => Q(k, d))],
    ...(o.body ? { requestBody: { required: true, content: { 'application/json': { schema: o.body } } } } : {}),
    responses: {
      ...(o.responses ?? { 200: 'OK' }),
      400: 'Validation error',
      ...(o.auth !== 'none' ? { 401: 'Not authenticated', 404: 'Not found (including resources owned by other users)' } : {}),
      429: 'Rate limited',
      503: 'Integration not configured',
    },
  };
}

function fixResponses(spec: Record<string, Record<string, ReturnType<typeof op>>>) {
  for (const path of Object.values(spec)) {
    for (const o of Object.values(path)) {
      o.responses = Object.fromEntries(
        Object.entries(o.responses).map(([k, v]) => [k, { description: v as unknown as string, content: { 'application/json': { schema: { $ref: k.startsWith('2') ? '#/components/schemas/Any' : '#/components/schemas/Error' } } } }]),
      ) as never;
    }
  }
  return spec;
}

export function buildOpenApi(serverUrl: string) {
  const paths = {
    '/health': { get: op({ summary: 'Liveness + integration status', tags: ['System'], auth: 'none' }) },
    '/auth/register': { post: op({ summary: 'Create account and start a session', tags: ['Auth'], auth: 'none', body: js(registerSchema), responses: { 201: 'Created' } }) },
    '/auth/login': { post: op({ summary: 'Sign in (sets HttpOnly session cookie)', tags: ['Auth'], auth: 'none', body: js(loginSchema) }) },
    '/auth/logout': { post: op({ summary: 'Sign out', tags: ['Auth'] }) },
    '/auth/me': { get: op({ summary: 'Current user', tags: ['Auth'] }) },
    '/auth/password/forgot': { post: op({ summary: 'Request a reset link (requires email provider)', tags: ['Auth'], auth: 'none' }) },
    '/auth/password/reset': { post: op({ summary: 'Reset password with token', tags: ['Auth'], auth: 'none' }) },
    '/auth/password/change': { post: op({ summary: 'Change password', tags: ['Auth'] }) },
    '/me/settings': { get: op({ summary: 'Get settings', tags: ['Settings'] }), patch: op({ summary: 'Update settings', tags: ['Settings'], body: js(updateSettingsSchema) }) },
    '/me': { delete: op({ summary: 'Delete account and all data', tags: ['Settings'] }) },
    '/markets/overview': { get: op({ summary: 'Index-tracking ETF quotes + market state', tags: ['Markets'] }) },
    '/markets/news': { get: op({ summary: 'General market news', tags: ['Markets'] }) },
    '/markets/search': { get: op({ summary: 'Symbol search', tags: ['Markets'], query: { q: 'search text' } }) },
    '/markets/compare': { get: op({ summary: 'Compare 2–5 symbols (returns, vol, correlation, metrics)', tags: ['Markets'], query: { symbols: 'comma-separated', range: '1M|3M|6M|YTD|1Y|5Y' } }) },
    '/markets/{symbol}': { get: op({ summary: 'Quote, profile and metrics', tags: ['Markets'], params: ['symbol'] }) },
    '/markets/{symbol}/history': { get: op({ summary: 'Daily history + summary analytics', tags: ['Markets'], params: ['symbol'], query: { range: '1M|3M|6M|YTD|1Y|5Y' } }) },
    '/markets/{symbol}/news': { get: op({ summary: 'Company news', tags: ['Markets'], params: ['symbol'], query: { days: '1–30' } }) },
    '/markets/{symbol}/filings': { get: op({ summary: 'Recent SEC filings', tags: ['Markets'], params: ['symbol'] }) },
    '/watchlists': { get: op({ summary: 'List watchlists', tags: ['Watchlists'] }), post: op({ summary: 'Create watchlist', tags: ['Watchlists'], body: js(watchlistCreateSchema), responses: { 201: 'Created' } }) },
    '/watchlists/{id}': {
      get: op({ summary: 'Watchlist with quotes', tags: ['Watchlists'], params: ['id'] }),
      patch: op({ summary: 'Rename / describe', tags: ['Watchlists'], params: ['id'], body: js(watchlistCreateSchema.partial()) }),
      delete: op({ summary: 'Delete watchlist', tags: ['Watchlists'], params: ['id'] }),
    },
    '/watchlists/{id}/items': { post: op({ summary: 'Add symbol', tags: ['Watchlists'], params: ['id'], body: js(watchlistItemSchema), responses: { 201: 'Created' } }) },
    '/watchlists/{id}/items/{symbol}': {
      patch: op({ summary: 'Edit note', tags: ['Watchlists'], params: ['id', 'symbol'] }),
      delete: op({ summary: 'Remove symbol', tags: ['Watchlists'], params: ['id', 'symbol'] }),
    },
    '/portfolios': { get: op({ summary: 'List hypothetical portfolios', tags: ['Portfolio Lab'] }), post: op({ summary: 'Create', tags: ['Portfolio Lab'], body: js(portfolioCreateSchema), responses: { 201: 'Created' } }) },
    '/portfolios/{id}': {
      get: op({ summary: 'Get', tags: ['Portfolio Lab'], params: ['id'] }),
      patch: op({ summary: 'Update', tags: ['Portfolio Lab'], params: ['id'], body: js(portfolioCreateSchema.partial()) }),
      delete: op({ summary: 'Delete', tags: ['Portfolio Lab'], params: ['id'] }),
    },
    '/portfolios/{id}/analytics': { get: op({ summary: 'Valuation, allocation, drawdown, benchmark, correlation', tags: ['Portfolio Lab'], params: ['id'], query: { range: '3M|6M|1Y' } }) },
    '/alerts': { get: op({ summary: 'List alerts', tags: ['Alerts'] }), post: op({ summary: 'Create alert', tags: ['Alerts'], body: js(alertCreateSchema), responses: { 201: 'Created' } }) },
    '/alerts/{id}': { patch: op({ summary: 'Update alert', tags: ['Alerts'], params: ['id'], body: js(alertUpdateSchema) }), delete: op({ summary: 'Delete alert', tags: ['Alerts'], params: ['id'] }) },
    '/alerts/events': { get: op({ summary: 'Triggered events', tags: ['Alerts'] }) },
    '/alerts/evaluate': { post: op({ summary: 'Evaluate my alerts now', tags: ['Alerts'] }) },
    '/notifications': { get: op({ summary: 'Notification center', tags: ['Notifications'], query: { unread: 'true|false' } }) },
    '/notifications/{id}/read': { post: op({ summary: 'Mark read', tags: ['Notifications'], params: ['id'] }) },
    '/notifications/read-all': { post: op({ summary: 'Mark all read', tags: ['Notifications'] }) },
    '/notifications/test': { post: op({ summary: 'Send a test through enabled channels', tags: ['Notifications'] }) },
    '/research': { post: op({ summary: 'Run the research pipeline', tags: ['Research'], body: js(researchRequestSchema), responses: { 201: 'Report created' } }) },
    '/research/capabilities': { get: op({ summary: 'Which research integrations are configured', tags: ['Research'] }) },
    '/research/runs': { get: op({ summary: 'Run history', tags: ['Research'] }) },
    '/research/runs/{id}': { get: op({ summary: 'Run detail with step log', tags: ['Research'], params: ['id'] }) },
    '/research/documents': { get: op({ summary: 'Source documents', tags: ['Research'], query: { symbol: 'filter', kind: 'news|filing|rss|upload', mine: 'true|false' } }) },
    '/research/documents/{id}': { get: op({ summary: 'Source document text', tags: ['Research'], params: ['id'] }), delete: op({ summary: 'Delete my document', tags: ['Research'], params: ['id'] }) },
    '/research/documents/upload': { post: { ...op({ summary: 'Upload PDF/TXT/MD (multipart field "file")', tags: ['Research'] }), requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, symbols: { type: 'string' } } } } } } } },
    '/research/documents/rss': { post: op({ summary: 'Import an RSS/Atom feed', tags: ['Research'] }) },
    '/reports': { get: op({ summary: 'Search reports', tags: ['Reports'], query: { q: 'full-text', kind: 'research|daily_brief|weekly_digest', saved: 'true|false', symbol: 'filter', sort: 'newest|oldest' } }) },
    '/reports/{id}': {
      get: op({ summary: 'Report with citations', tags: ['Reports'], params: ['id'] }),
      patch: op({ summary: 'Save / rename', tags: ['Reports'], params: ['id'] }),
      delete: op({ summary: 'Delete', tags: ['Reports'], params: ['id'] }),
    },
    '/reports/{id}/share': { post: op({ summary: 'Enable/disable a share link', tags: ['Reports'], params: ['id'] }) },
    '/reports/shared/{token}': { get: op({ summary: 'Read a shared report', tags: ['Reports'], auth: 'none', params: ['token'] }) },
    '/automations': { get: op({ summary: 'Workflow definitions + runtime status', tags: ['Automations'] }) },
    '/automations/executions': { get: op({ summary: 'Execution history', tags: ['Automations'] }) },
    '/automations/health': { get: op({ summary: 'Provider health', tags: ['Automations'] }) },
    '/automations/{key}': { patch: op({ summary: 'Enable/disable, schedule, trigger', tags: ['Automations'], auth: 'admin', params: ['key'], body: js(workflowUpdateSchema) }) },
    '/automations/{key}/run': { post: op({ summary: 'Run now / rerun', tags: ['Automations'], auth: 'admin', params: ['key'] }) },
    '/hooks/n8n/run': { post: op({ summary: 'Signed trigger from n8n', tags: ['Automations'], auth: 'hmac' }) },
    '/admin/users': { get: op({ summary: 'List users', tags: ['Admin'], auth: 'admin' }) },
    '/admin/users/{id}/role': { patch: op({ summary: 'Change role', tags: ['Admin'], auth: 'admin', params: ['id'] }) },
    '/admin/audit': { get: op({ summary: 'Audit log', tags: ['Admin'], auth: 'admin' }) },
  };
  return {
    openapi: '3.0.3',
    info: {
      title: 'AlphaPulse AI API',
      version: '0.1.0',
      description:
        'Investment research & workflow automation API. Research and education only — not financial advice.\n\n' +
        'Auth: session cookie `ap_session` (HttpOnly). All non-GET requests also require header `X-AlphaPulse-CSRF: 1`.\n' +
        'Errors: `{ "error": { "code", "message", "details?" } }`.',
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'ap_session' },
        csrf: { type: 'apiKey', in: 'header', name: 'X-AlphaPulse-CSRF', description: 'Must be "1" on non-GET requests' },
        n8nSignature: { type: 'apiKey', in: 'header', name: 'X-AlphaPulse-Signature', description: 'sha256=HMAC(secret, `${X-AlphaPulse-Timestamp}.${rawBody}`)' },
      },
      schemas: {
        Any: { type: 'object' },
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
      },
    },
    paths: fixResponses(paths as never),
  };
}
