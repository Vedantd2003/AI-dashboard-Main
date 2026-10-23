import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { FetchLike } from './lib/http.js';
import { safeFetch as realSafeFetch } from './lib/safeFetch.js';
import { DevOutbox, ResendProvider, type EmailProvider } from './providers/email.js';
import { FinnhubProvider } from './providers/finnhub.js';
import { OpenRouterProvider, type LlmProvider } from './providers/llm.js';
import { SecEdgarClient } from './providers/sec.js';
import { TwelveDataProvider } from './providers/twelveData.js';
import type { FundamentalsProvider, MarketDataProvider } from './providers/types.js';

/** Everything external, injected so tests can substitute fakes. */
export interface Deps {
  config: Config;
  logger: Logger;
  market: MarketDataProvider | null;
  fundamentals: FundamentalsProvider | null;
  sec: SecEdgarClient | null;
  llm: LlmProvider | null;
  email: EmailProvider | null;
  devOutbox: DevOutbox;
  safeFetch: typeof realSafeFetch;
  now: () => Date;
}

export function buildDeps(config: Config, logger: Logger, fetchImpl?: FetchLike): Deps {
  return {
    config,
    logger,
    market: config.TWELVE_DATA_API_KEY ? new TwelveDataProvider(config.TWELVE_DATA_API_KEY, fetchImpl) : null,
    fundamentals: config.FINNHUB_API_KEY ? new FinnhubProvider(config.FINNHUB_API_KEY, fetchImpl) : null,
    sec: config.SEC_USER_AGENT ? new SecEdgarClient(config.SEC_USER_AGENT, fetchImpl) : null,
    llm: config.OPENROUTER_API_KEY
      ? new OpenRouterProvider(config.OPENROUTER_API_KEY, config.OPENROUTER_MODEL, config.OPENROUTER_BASE_URL, config.APP_BASE_URL, fetchImpl)
      : null,
    email: config.RESEND_API_KEY && config.EMAIL_FROM ? new ResendProvider(config.RESEND_API_KEY, config.EMAIL_FROM, fetchImpl) : null,
    devOutbox: new DevOutbox(),
    safeFetch: realSafeFetch,
    now: () => new Date(),
  };
}
