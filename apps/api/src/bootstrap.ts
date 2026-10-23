import type { AppContext } from './context.js';
import type { Deps } from './deps.js';
import { createLimiters } from './middleware/rateLimits.js';
import { MarketService } from './services/markets.js';
import { NotificationService } from './services/notifications.js';
import { ResearchService } from './services/research.js';
import { createBullDispatcher, InProcessDispatcher, Scheduler, type JobDispatcher } from './services/scheduler.js';
import { WorkflowService } from './services/workflows.js';

export async function buildContext(deps: Deps, opts: { startScheduler?: boolean; rateLimitScale?: number } = {}): Promise<AppContext> {
  const markets = new MarketService(deps);
  const notifications = new NotificationService(deps);
  const research = new ResearchService(deps, markets);
  const workflows = new WorkflowService(deps, markets, notifications, research);
  let dispatcher: JobDispatcher = new InProcessDispatcher(workflows, deps);
  if (deps.config.REDIS_URL) {
    try {
      dispatcher = await createBullDispatcher(deps.config.REDIS_URL, workflows, deps);
    } catch (e) {
      deps.logger.error({ err: (e as Error).message }, 'Redis unavailable — falling back to in-process dispatcher');
    }
  }
  const scheduler = opts.startScheduler && deps.config.SCHEDULER_ENABLED ? new Scheduler(dispatcher, deps) : null;
  return { deps, markets, notifications, research, workflows, dispatcher, scheduler, limits: createLimiters(opts.rateLimitScale ?? 1) };
}
