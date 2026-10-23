import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { normalizeSymbols, objectIdSchema, paginationSchema, researchRequestSchema, symbolSchema } from '@alphapulse/shared';
import type { AppContext } from '../context.js';
import { randomToken } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { body, params, query } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { ResearchReport, ResearchRun, SourceDocument } from '../models/index.js';
import { STALE_RUN_MS } from '../services/research.js';
import { ingestRssFeed, ingestUpload, UPLOAD_LIMIT_BYTES } from '../services/ingestion.js';

const idParam = z.object({ id: objectIdSchema });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: UPLOAD_LIMIT_BYTES, files: 1 } });

export function researchRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireAuth);

  r.get('/capabilities', (_req, res) => {
    const d = ctx.deps;
    res.json({
      llm: d.llm ? { configured: true, provider: d.llm.name, model: d.llm.model } : { configured: false, hint: 'Set GEMINI_API_KEY (or OPENROUTER_API_KEY) to enable AI analysis. Without it, reports contain only observed and calculated data.' },
      marketData: !!d.market,
      news: !!d.fundamentals,
      filings: !!d.sec,
      dailyLimit: d.config.RESEARCH_DAILY_LIMIT_PER_USER,
    });
  });

  r.post('/', ctx.limits.expensive, async (req, res) => {
    const input = body(req, researchRequestSchema);
    const { valid } = normalizeSymbols(input.symbols);
    await ctx.research.assertWithinLimit(me(req)._id);
    if (req.query.mode === 'async') {
      const run = await ctx.research.start({ ...input, symbols: valid }, { userId: me(req)._id });
      return res.status(202).json({ runId: String(run._id), status: 'running' });
    }
    const { run, report } = await ctx.research.run({ ...input, symbols: valid }, { userId: me(req)._id });
    res.status(201).json({ runId: String(run._id), reportId: String(report._id), report: { ...report.toObject(), id: String(report._id) } });
  });

  r.get('/runs', async (req, res) => {
    const { page, pageSize } = query(req, paginationSchema);
    const filter = { userId: me(req)._id };
    const [items, total] = await Promise.all([
      ResearchRun.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      ResearchRun.countDocuments(filter),
    ]);
    res.json({ items: items.map((x) => ({ ...x, id: String(x._id) })), page, pageSize, total });
  });

  r.get('/runs/:id', async (req, res) => {
    const { id } = params(req, idParam);
    let run = await ResearchRun.findOne({ _id: id, userId: me(req)._id }).lean();
    if (!run) throw notFound('Research run');
    if (run.status === 'running' && run.startedAt && ctx.deps.now().getTime() - new Date(run.startedAt).getTime() > STALE_RUN_MS) {
      run =
        (await ResearchRun.findOneAndUpdate(
          { _id: id, status: 'running' },
          { $set: { status: 'failed', error: 'The run was interrupted before it finished (the server restarted). Please run it again.', finishedAt: ctx.deps.now() } },
          { returnDocument: 'after' },
        ).lean()) ?? run;
    }
    res.json({ ...run, id: String(run._id) });
  });

  // ── documents (user uploads + RSS imports + browse global sources) ──
  r.get('/documents', async (req, res) => {
    const q = query(req, paginationSchema.extend({ symbol: symbolSchema.optional(), kind: z.enum(['news', 'filing', 'rss', 'upload']).optional(), mine: z.enum(['true', 'false']).optional() }));
    const filter: Record<string, unknown> = q.mine === 'true' ? { ownerId: me(req)._id } : { $or: [{ ownerId: null }, { ownerId: me(req)._id }] };
    if (q.symbol) filter.symbols = q.symbol;
    if (q.kind) filter.kind = q.kind;
    const [items, total] = await Promise.all([
      SourceDocument.find(filter).select('-text').sort({ publishedAt: -1, createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      SourceDocument.countDocuments(filter),
    ]);
    res.json({ items: items.map((d) => ({ ...d, id: String(d._id) })), page: q.page, pageSize: q.pageSize, total });
  });

  r.get('/documents/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const d = await SourceDocument.findOne({ _id: id, $or: [{ ownerId: null }, { ownerId: me(req)._id }] }).lean();
    if (!d) throw notFound('Document');
    res.json({ ...d, id: String(d._id), text: (d.text ?? '').slice(0, 50_000), truncated: (d.text ?? '').length > 50_000 });
  });

  r.post('/documents/upload', ctx.limits.expensive, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: { code: 'bad_request', message: 'Attach a file in the "file" field' } });
    const symbols = normalizeSymbols(String(req.body?.symbols ?? '').split(',').filter(Boolean)).valid;
    const doc = await ingestUpload(me(req)._id, req.file, symbols);
    res.status(201).json({ id: String(doc!._id), title: doc!.title, extraction: doc!.extraction, chars: doc!.text.length });
  });

  r.post('/documents/rss', ctx.limits.expensive, async (req, res) => {
    const input = body(req, z.object({ url: z.string().url().max(500), symbols: z.array(symbolSchema).max(5).default([]) }));
    const out = await ingestRssFeed(ctx.deps, me(req)._id, input.url, input.symbols);
    res.status(201).json({ feedTitle: out.feedTitle, imported: out.imported });
  });

  r.delete('/documents/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const d = await SourceDocument.deleteOne({ _id: id, ownerId: me(req)._id });
    if (!d.deletedCount) throw notFound('Document');
    res.json({ ok: true });
  });

  return r;
}

export function reportsRouter(_ctx: AppContext) {
  const r = Router();

  /** Public read of a report the owner explicitly shared (unguessable token, revocable). */
  r.get('/shared/:token', async (req, res) => {
    const { token } = params(req, z.object({ token: z.string().min(20).max(64) }));
    const rep = await ResearchReport.findOne({ shareToken: token }).select('-userId -shareToken').lean();
    if (!rep) throw notFound('Report');
    res.json({ ...rep, id: String(rep._id), shared: true });
  });

  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const q = query(
      req,
      paginationSchema.extend({
        kind: z.enum(['research', 'daily_brief', 'weekly_digest']).optional(),
        saved: z.enum(['true', 'false']).optional(),
        q: z.string().trim().max(100).optional(),
        symbol: symbolSchema.optional(),
        sort: z.enum(['newest', 'oldest']).default('newest'),
      }),
    );
    const filter: Record<string, unknown> = { userId: me(req)._id };
    if (q.kind) filter.kind = q.kind;
    if (q.saved === 'true') filter.saved = true;
    if (q.symbol) filter.symbols = q.symbol;
    if (q.q) filter.$text = { $search: q.q };
    const [items, total] = await Promise.all([
      ResearchReport.find(filter)
        .select('title kind symbols generatedAt executiveSummary evidenceStrength saved citationStats model')
        .sort({ generatedAt: q.sort === 'newest' ? -1 : 1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      ResearchReport.countDocuments(filter),
    ]);
    res.json({ items: items.map((x) => ({ ...x, id: String(x._id) })), page: q.page, pageSize: q.pageSize, total });
  });

  r.get('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const rep = await ResearchReport.findOne({ _id: id, userId: me(req)._id }).lean();
    if (!rep) throw notFound('Report');
    res.json({ ...rep, id: String(rep._id) });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, z.object({ saved: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() }));
    const rep = await ResearchReport.findOneAndUpdate({ _id: id, userId: me(req)._id }, { $set: input }, { returnDocument: 'after' });
    if (!rep) throw notFound('Report');
    res.json({ id: String(rep._id), saved: rep.saved, title: rep.title });
  });

  r.post('/:id/share', async (req, res) => {
    const { id } = params(req, idParam);
    const { enabled } = body(req, z.object({ enabled: z.boolean() }));
    const rep = await ResearchReport.findOne({ _id: id, userId: me(req)._id });
    if (!rep) throw notFound('Report');
    if (enabled) rep.shareToken = rep.shareToken ?? randomToken(24);
    else rep.set('shareToken', undefined);
    await rep.save();
    res.json({ shareToken: rep.shareToken ?? null, path: rep.shareToken ? `/shared/${rep.shareToken}` : null });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = params(req, idParam);
    const d = await ResearchReport.deleteOne({ _id: id, userId: me(req)._id });
    if (!d.deletedCount) throw notFound('Report');
    res.json({ ok: true });
  });

  return r;
}
