import { z } from 'zod';
import { SYMBOL_RE } from './symbols.js';

// ───────────────────────── primitives ─────────────────────────
export const DASHBOARD_WIDGETS = ['pulse', 'market', 'movers', 'performance', 'evidence', 'allocation', 'activity', 'watchlists', 'headlines', 'research', 'alerts', 'workflows', 'health'] as const;

export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SYMBOL_RE, 'Invalid symbol');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'ISO 4217 code');

// ───────────────────────── auth ─────────────────────────
export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  name: z.string().trim().min(1).max(80),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

export const notificationPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  webhook: z.boolean(),
  webhookUrl: z.string().url().max(500).nullable().optional(),
  dailyBrief: z.boolean(),
  weeklyDigest: z.boolean(),
});
export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().max(64).optional(),
  dashboardWidgets: z.array(z.enum(DASHBOARD_WIDGETS)).max(20).optional(),
  notificationPrefs: notificationPrefsSchema.partial().optional(),
});

// ───────────────────────── watchlists ─────────────────────────
export const watchlistCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).optional(),
});
export const watchlistUpdateSchema = watchlistCreateSchema.partial();
export const watchlistItemSchema = z.object({
  symbol: symbolSchema,
  note: z.string().trim().max(1000).optional(),
});
export const watchlistItemUpdateSchema = z.object({ note: z.string().trim().max(1000) });

// ───────────────────────── alerts ─────────────────────────
export const alertCreateSchema = z
  .object({
    symbol: symbolSchema,
    type: z.enum(['price_above', 'price_below', 'pct_move']),
    threshold: z.number().finite().positive(),
    cooldownMinutes: z.number().int().min(15).max(10_080).default(1440),
    channels: z.array(z.enum(['in_app', 'email', 'webhook'])).min(1).default(['in_app']),
    watchlistId: objectIdSchema.optional(),
  })
  .refine((a) => a.type !== 'pct_move' || a.threshold <= 100, { message: 'Percent threshold must be ≤ 100', path: ['threshold'] });
export const alertUpdateSchema = z.object({
  active: z.boolean().optional(),
  threshold: z.number().finite().positive().optional(),
  cooldownMinutes: z.number().int().min(15).max(10_080).optional(),
  channels: z.array(z.enum(['in_app', 'email', 'webhook'])).min(1).optional(),
});

// ───────────────────────── portfolios ─────────────────────────
export const positionSchema = z.object({
  symbol: symbolSchema,
  quantity: z.number().finite().positive().max(1e9),
  averageCost: z.number().finite().nonnegative().max(1e9),
  currency: currencySchema.default('USD'),
  purchaseDate: z.string().date().optional(),
});
export const portfolioCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseCurrency: currencySchema.default('USD'),
  benchmark: symbolSchema.optional(),
  positions: z.array(positionSchema).max(200).default([]),
});
export const portfolioUpdateSchema = portfolioCreateSchema.partial();

// ───────────────────────── markets ─────────────────────────
export const historyRangeSchema = z.enum(['1M', '3M', '6M', 'YTD', '1Y', '5Y']);
export const historyQuerySchema = z.object({ range: historyRangeSchema.default('6M') });
export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(40) });

// ───────────────────────── research ─────────────────────────
export const researchTaskSchema = z.enum([
  'company_update',
  'price_move',
  'compare',
  'themes',
  'earnings',
  'risks',
  'bull_bear',
  'morning_brief',
  'custom',
]);

export const researchRequestSchema = z.object({
  question: z.string().trim().min(8).max(1000),
  symbols: z.array(symbolSchema).min(1).max(5),
  task: researchTaskSchema.default('custom'),
  lookbackDays: z.number().int().min(1).max(90).default(14),
  documentIds: z.array(objectIdSchema).max(5).default([]),
});

export const claimBasisSchema = z.enum(['observed_data', 'source_reported', 'calculated', 'interpretation', 'speculative', 'unverified']);
export const citationSchema = z.object({ sourceId: z.string().min(1).max(64), evidence: z.string().min(1).max(600) });
export const claimSchema = z.object({
  text: z.string().min(1).max(800),
  basis: claimBasisSchema,
  citations: z.array(citationSchema).max(5),
});

/** The part of a research report the LLM writes. */
export const llmReportSchema = z.object({
  executiveSummary: z.string().min(1).max(2000),
  keyFindings: z.array(claimSchema).max(10),
  bullishFactors: z.array(claimSchema).max(8),
  bearishFactors: z.array(claimSchema).max(8),
  risks: z.array(claimSchema).max(8),
  uncertainties: z.array(z.string().max(400)).max(8),
  followUpQuestions: z.array(z.string().max(300)).max(8),
  limitations: z.array(z.string().max(400)).max(8),
  /** Qualitative only — never a probability. */
  evidenceStrength: z.enum(['weak', 'moderate', 'strong']),
});
export type LlmReport = z.infer<typeof llmReportSchema>;

/** JSON Schema (strict-mode compatible) mirroring llmReportSchema for `response_format: json_schema`. */
export const llmReportJsonSchema = (() => {
  const claim = {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'basis', 'citations'],
    properties: {
      text: { type: 'string' },
      basis: { type: 'string', enum: claimBasisSchema.options },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sourceId', 'evidence'],
          properties: { sourceId: { type: 'string' }, evidence: { type: 'string' } },
        },
      },
    },
  };
  const strArr = { type: 'array', items: { type: 'string' } };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'executiveSummary',
      'keyFindings',
      'bullishFactors',
      'bearishFactors',
      'risks',
      'uncertainties',
      'followUpQuestions',
      'limitations',
      'evidenceStrength',
    ],
    properties: {
      executiveSummary: { type: 'string' },
      keyFindings: { type: 'array', items: claim },
      bullishFactors: { type: 'array', items: claim },
      bearishFactors: { type: 'array', items: claim },
      risks: { type: 'array', items: claim },
      uncertainties: strArr,
      followUpQuestions: strArr,
      limitations: strArr,
      evidenceStrength: { type: 'string', enum: ['weak', 'moderate', 'strong'] },
    },
  } as const;
})();

export const FINANCIAL_DISCLAIMER =
  'AI-generated analysis may contain errors and is for research and education only. It is not individualized financial advice, ' +
  'a recommendation to buy or sell any security, or a guarantee of future results.';

// ───────────────────────── workflows ─────────────────────────
export const workflowKeySchema = z.enum(['daily_brief', 'watchlist_monitor', 'weekly_digest', 'source_health']);
export type WorkflowKey = z.infer<typeof workflowKeySchema>;
export const workflowUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  schedule: z.string().regex(/^[\d*/,\- ]{9,64}$/, 'cron expression').optional(),
  timezone: z.string().max(64).optional(),
});
