import cron from 'node-cron';
import type { WorkflowKey } from '@alphapulse/shared';
import type { Deps } from '../deps.js';
import { WorkflowDefinition } from '../models/index.js';
import type { WorkflowService } from './workflows.js';

/**
 * Job dispatch. With REDIS_URL, workflow runs go through a BullMQ queue (durable, retried by BullMQ, one worker
 * concurrency per process). Without Redis, runs execute in-process — a single-instance runner, NOT a distributed queue.
 * Either way, WorkflowService enforces idempotency via the unique execution key in MongoDB.
 */
export interface JobDispatcher {
  readonly mode: 'in_process' | 'bullmq';
  dispatch(key: WorkflowKey, trigger: 'scheduler' | 'n8n'): Promise<void>;
  close(): Promise<void>;
}

export class InProcessDispatcher implements JobDispatcher {
  readonly mode = 'in_process' as const;
  private running = new Set<WorkflowKey>();
  constructor(private readonly workflows: WorkflowService, private readonly deps: Deps) {}
  async dispatch(key: WorkflowKey, trigger: 'scheduler' | 'n8n') {
    if (this.running.has(key)) {
      this.deps.logger.info({ workflow: key }, 'workflow already running in this process; skipping');
      return;
    }
    this.running.add(key);
    // Fire-and-forget; result is persisted in workflowExecutions.
    void this.workflows
      .run(key, trigger)
      .catch((e) => this.deps.logger.error({ workflow: key, err: (e as Error).message }, 'workflow crashed'))
      .finally(() => this.running.delete(key));
  }
  async close() {}
}

export async function createBullDispatcher(redisUrl: string, workflows: WorkflowService, deps: Deps): Promise<JobDispatcher> {
  const { Queue, Worker } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('workflows', { connection });
  const worker = new Worker(
    'workflows',
    async (job) => {
      const { key, trigger } = job.data as { key: WorkflowKey; trigger: 'scheduler' | 'n8n' };
      return workflows.run(key, trigger);
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, err) => deps.logger.error({ job: job?.id, err: err.message }, 'bull job failed'));
  return {
    mode: 'bullmq',
    async dispatch(key, trigger) {
      await queue.add(key, { key, trigger }, { removeOnComplete: 200, removeOnFail: 500, attempts: 1 });
    },
    async close() {
      await worker.close();
      await queue.close();
      connection.disconnect();
    },
  };
}

export class Scheduler {
  private tasks: { stop: () => void | Promise<void> }[] = [];
  constructor(private readonly dispatcher: JobDispatcher, private readonly deps: Deps) {}

  /** (Re)loads enabled definitions whose trigger is "scheduler". */
  async reload() {
    for (const t of this.tasks) await t.stop();
    this.tasks = [];
    const defs = await WorkflowDefinition.find({ enabled: true, trigger: 'scheduler' });
    for (const d of defs) {
      if (!cron.validate(d.schedule)) {
        this.deps.logger.warn({ workflow: d.key, schedule: d.schedule }, 'invalid cron; not scheduled');
        continue;
      }
      const task = cron.schedule(d.schedule, () => void this.dispatcher.dispatch(d.key as WorkflowKey, 'scheduler'), { timezone: d.timezone, name: d.key });
      this.tasks.push(task);
    }
    this.deps.logger.info({ scheduled: defs.map((d) => d.key) }, 'scheduler loaded');
    return defs.map((d) => d.key);
  }

  async stop() {
    for (const t of this.tasks) await t.stop();
    this.tasks = [];
  }
}

export const isValidCron = (expr: string) => cron.validate(expr);
