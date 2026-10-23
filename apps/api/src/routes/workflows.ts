import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, paginationSchema, workflowKeySchema, workflowUpdateSchema, type WorkflowKey } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { verifySignature } from '../lib/crypto.js';
import { AppError, badRequest, notConfigured, notFound } from '../lib/errors.js';
import { body, params, query } from '../lib/validate.js';
import { me, requireAdmin, requireAuth } from '../middleware/auth.js';
import { ProviderHealth, WorkflowDefinition, WorkflowExecution } from '../models/index.js';
import { audit } from '../services/audit.js';
import { isUsTradingDay } from '../services/calendar.js';
import { isValidCron } from '../services/scheduler.js';

const keyParam = z.object({ key: workflowKeySchema });

export function automationsRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  /** Visible to all signed-in users (read-only); changes and manual runs require admin. */
  r.get('/', async (_req, res) => {
    const defs = await WorkflowDefinition.find().sort({ key: 1 }).lean();
    const last = await Promise.all(defs.map((d) => WorkflowExecution.findOne({ workflowKey: d.key }).sort({ startedAt: -1 }).lean()));
    res.json({
      items: defs.map((d, i) => ({ ...d, id: d.key, lastExecution: last[i] ?? null })),
      runtime: {
        scheduler: ctx.scheduler ? 'enabled' : 'disabled',
        queue: ctx.dispatcher.mode,
        n8nWebhook: ctx.deps.config.integrations.n8n ? 'configured' : 'not_configured',
        n8nBaseUrl: ctx.deps.config.N8N_BASE_URL ?? null,
        marketCalendar: isUsTradingDay(ctx.deps.now()),
      },
    });
  });

  r.get('/executions', async (req, res) => {
    const q = query(req, paginationSchema.extend({ key: workflowKeySchema.optional(), status: z.enum(['running', 'succeeded', 'failed', 'skipped']).optional() }));
    const filter: Record<string, unknown> = {};
    if (q.key) filter.workflowKey = q.key;
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      WorkflowExecution.find(filter).sort({ startedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      WorkflowExecution.countDocuments(filter),
    ]);
    res.json({ items: items.map((x) => ({ ...x, id: String(x._id) })), page: q.page, pageSize: q.pageSize, total });
  });

  r.get('/health', async (_req, res) => {
    const providers = ['Twelve Data', 'Finnhub', 'SEC EDGAR'];
    const latest = await Promise.all(providers.map((p) => ProviderHealth.findOne({ provider: p }).sort({ checkedAt: -1 }).lean()));
    res.json({ checks: latest.map((l, i) => l ?? { provider: providers[i], status: 'never_checked' }), live: ctx.markets.providerStatuses() });
  });

  r.patch('/:key', requireAdmin, async (req, res) => {
    const { key } = params(req, keyParam);
    const input = body(req, workflowUpdateSchema.extend({ trigger: z.enum(['scheduler', 'n8n', 'manual']).optional() }));
    if (input.schedule && !isValidCron(input.schedule)) throw badRequest('Invalid cron expression');
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
      } catch {
        throw badRequest('Unknown time zone');
      }
    }
    if (input.trigger === 'scheduler' && !ctx.scheduler) throw badRequest('The in-process scheduler is disabled (set SCHEDULER_ENABLED=true).');
    if (input.trigger === 'n8n' && !ctx.deps.config.integrations.n8n) throw notConfigured('n8n', 'Set N8N_WEBHOOK_SECRET and import the workflows in services/workflows.');
    const d = await WorkflowDefinition.findOneAndUpdate({ key }, { $set: input }, { returnDocument: 'after' });
    if (!d) throw notFound('Workflow');
    await audit('workflow.updated', { userId: me(req)._id, req, target: key, meta: input });
    await ctx.scheduler?.reload();
    res.json(d);
  });

  r.post('/:key/run', requireAdmin, ctx.limits.expensive, async (req, res) => {
    const { key } = params(req, keyParam);
    const { rerunOf } = body(req, z.object({ rerunOf: objectIdSchema.optional() }).default({}));
    if (rerunOf && !(await WorkflowExecution.exists({ _id: rerunOf, workflowKey: key }))) throw notFound('Execution');
    await audit('workflow.manual_run', { userId: me(req)._id, req, target: key, meta: { rerunOf } });
    const result = await ctx.workflows.run(key, 'manual', { triggeredBy: me(req)._id, rerunOf: rerunOf ?? null });
    res.status(result.status === 'failed' ? 500 : 200).json(result);
  });

  return r;
}

/**
 * n8n → API. Authenticated by HMAC over the raw body (no cookies, CSRF-exempt).
 * Body: { "workflow": "<key>" }. The execution is idempotent per schedule bucket.
 */
export function n8nHookRouter(ctx: AppContext) {
  const r = Router();
  r.post('/run', ctx.limits.expensive, async (req, res) => {
    const secret = ctx.deps.config.N8N_WEBHOOK_SECRET;
    if (!secret) throw notConfigured('n8n webhook', 'Set N8N_WEBHOOK_SECRET.');
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifySignature(secret, req.get('x-alphapulse-timestamp'), req.get('x-alphapulse-signature'), raw, Date.now())) {
      throw new AppError(401, 'bad_signature', 'Invalid or expired signature');
    }
    const { workflow } = body(req, z.object({ workflow: workflowKeySchema }));
    const def = await WorkflowDefinition.findOne({ key: workflow });
    if (!def?.enabled || def.trigger !== 'n8n') {
      return res.status(409).json({ error: { code: 'workflow_not_enabled_for_n8n', message: 'Enable this workflow with trigger "n8n" in Automations first.' } });
    }
    const result = await ctx.workflows.run(workflow as WorkflowKey, 'n8n');
    res.status(result.status === 'failed' ? 500 : 200).json(result);
  });
  return r;
}
