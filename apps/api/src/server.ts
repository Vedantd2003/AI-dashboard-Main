import mongoose from 'mongoose';
import { createApp } from './app.js';
import { buildContext } from './bootstrap.js';
import { loadConfig } from './config.js';
import { buildDeps } from './deps.js';
import { createLogger } from './logger.js';
import { syncAllIndexes } from './models/index.js';
import { ensureWorkflowDefinitions } from './services/workflows.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const deps = buildDeps(config, logger);

  if (!config.MONGODB_URI) {
    logger.fatal('MONGODB_URI is not set — the API cannot start without a database.');
    process.exit(1);
  }
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  logger.info('connected to MongoDB');
  await syncAllIndexes();
  await ensureWorkflowDefinitions();

  const ctx = await buildContext(deps, { startScheduler: true });
  if (ctx.scheduler) await ctx.scheduler.reload();

  const app = createApp(ctx);
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, integrations: config.integrations, queue: ctx.dispatcher.mode, scheduler: !!ctx.scheduler }, 'AlphaPulse API listening');
  });

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    server.close();
    await ctx.scheduler?.stop();
    await ctx.dispatcher.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('Fatal startup error:', (e as Error).message);
  process.exit(1);
});
