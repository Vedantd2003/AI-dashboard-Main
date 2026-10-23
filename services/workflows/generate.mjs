// Generates importable n8n workflow JSON. Run: node services/workflows/generate.mjs
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SIGN_CODE = `// Signs the request exactly as the API verifies it:
// signature = "sha256=" + HMAC_SHA256(N8N_WEBHOOK_SECRET, timestamp + "." + rawBody)
// Requires NODE_FUNCTION_ALLOW_BUILTIN=crypto and the env vars below on the n8n instance.
const crypto = require('crypto');
const secret = $env.ALPHAPULSE_WEBHOOK_SECRET;
if (!secret) throw new Error('ALPHAPULSE_WEBHOOK_SECRET is not set on the n8n instance');
const body = JSON.stringify({ workflow: '__KEY__' });
const timestamp = String(Date.now());
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
return [{ json: { body, timestamp, signature } }];`;

const defs = [
  { key: 'daily_brief', name: 'AlphaPulse — Daily market brief', cron: '30 7 * * 1-5', tz: 'America/New_York', timeout: 600000 },
  { key: 'watchlist_monitor', name: 'AlphaPulse — Watchlist event monitor', cron: '*/15 9-16 * * 1-5', tz: 'America/New_York', timeout: 120000 },
  { key: 'weekly_digest', name: 'AlphaPulse — Weekly research digest', cron: '0 9 * * 6', tz: 'America/New_York', timeout: 600000 },
  { key: 'source_health', name: 'AlphaPulse — Data source health monitor', cron: '0 * * * *', tz: 'UTC', timeout: 60000 },
];

for (const d of defs) {
  const wf = {
    name: d.name,
    active: false,
    settings: { timezone: d.tz, executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' },
    nodes: [
      { id: randomUUID(), name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: d.cron }] } } },
      { id: randomUUID(), name: 'Sign request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0], parameters: { jsCode: SIGN_CODE.replace('__KEY__', d.key) } },
      {
        id: randomUUID(),
        name: 'Run in AlphaPulse',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [480, 0],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 5000,
        parameters: {
          method: 'POST',
          url: '={{ $env.ALPHAPULSE_API_URL }}/api/v1/hooks/n8n/run',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'X-AlphaPulse-Timestamp', value: '={{ $json.timestamp }}' },
              { name: 'X-AlphaPulse-Signature', value: '={{ $json.signature }}' },
            ],
          },
          sendBody: true,
          contentType: 'raw',
          rawContentType: 'application/json',
          body: '={{ $json.body }}',
          options: { timeout: d.timeout, response: { response: { neverError: false } } },
        },
      },
    ],
    connections: {
      Schedule: { main: [[{ node: 'Sign request', type: 'main', index: 0 }]] },
      'Sign request': { main: [[{ node: 'Run in AlphaPulse', type: 'main', index: 0 }]] },
    },
    meta: { templateCredsSetupCompleted: true },
    tags: [],
  };
  writeFileSync(new URL(`./n8n/${d.key}.json`, import.meta.url), JSON.stringify(wf, null, 2) + '\n');
}
console.log('wrote', defs.length, 'workflows');
