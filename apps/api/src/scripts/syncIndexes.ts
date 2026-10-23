import { syncAllIndexes } from '../models/index.js';
import { ensureWorkflowDefinitions } from '../services/workflows.js';
import { connect, run } from './common.js';

void run(async () => {
  await connect();
  const dropped = await syncAllIndexes();
  await ensureWorkflowDefinitions();
  console.log('Indexes in sync. Dropped (no longer declared):', JSON.stringify(dropped));
});
