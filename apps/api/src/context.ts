import type { Deps } from './deps.js';
import type { Limiters } from './middleware/rateLimits.js';
import type { MarketService } from './services/markets.js';
import type { NotificationService } from './services/notifications.js';
import type { ResearchService } from './services/research.js';
import type { JobDispatcher, Scheduler } from './services/scheduler.js';
import type { WorkflowService } from './services/workflows.js';

export interface AppContext {
  deps: Deps;
  markets: MarketService;
  notifications: NotificationService;
  research: ResearchService;
  workflows: WorkflowService;
  dispatcher: JobDispatcher;
  scheduler: Scheduler | null;
  limits: Limiters;
}
