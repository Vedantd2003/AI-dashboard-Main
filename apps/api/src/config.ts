import { z } from 'zod';

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: optional,
  SESSION_SECRET: optional,
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: optional,
  /** Behind Render's proxy */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  // market & news
  TWELVE_DATA_API_KEY: optional,
  FINNHUB_API_KEY: optional,
  SEC_USER_AGENT: optional,

  // LLM
  OPENROUTER_API_KEY: optional,
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

  // delivery
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  ADMIN_EMAIL: optional,

  // workflows
  N8N_BASE_URL: optional,
  N8N_WEBHOOK_SECRET: optional,
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REDIS_URL: optional,

  // limits
  RESEARCH_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).default(20),
});

export type Config = z.infer<typeof envSchema> & {
  isProd: boolean;
  integrations: {
    database: boolean;
    marketData: boolean;
    news: boolean;
    filings: boolean;
    llm: boolean;
    email: boolean;
    n8n: boolean;
    redis: boolean;
  };
};

/** Required in production. Absence aborts boot with a list of missing names (values are never printed). */
const REQUIRED_IN_PROD = ['MONGODB_URI', 'SESSION_SECRET', 'APP_BASE_URL'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  if (isProd) {
    const missing = REQUIRED_IN_PROD.filter((k) => !c[k]);
    if (missing.length) throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
    if ((c.SESSION_SECRET ?? '').length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return {
    ...c,
    isProd,
    integrations: {
      database: !!c.MONGODB_URI,
      marketData: !!c.TWELVE_DATA_API_KEY,
      news: !!c.FINNHUB_API_KEY,
      filings: !!c.SEC_USER_AGENT,
      llm: !!c.OPENROUTER_API_KEY,
      email: !!c.RESEND_API_KEY && !!c.EMAIL_FROM,
      n8n: !!c.N8N_WEBHOOK_SECRET,
      redis: !!c.REDIS_URL,
    },
  };
}
