# n8n workflows

Four importable workflows live in `n8n/`. Each is three nodes:

```
Schedule (cron, workflow time zone)  →  Sign request (Code)  →  Run in AlphaPulse (HTTP POST, 3 tries)
```

The API does the real work (data, research, alerts, delivery, execution records). n8n only decides **when**.
This keeps one source of truth for business logic and lets the API enforce idempotency, timeouts, retries and audit.

| File | Workflow key | Schedule | Time zone |
|---|---|---|---|
| `daily_brief.json` | `daily_brief` | `30 7 * * 1-5` (the API also skips NYSE holidays) | America/New_York |
| `watchlist_monitor.json` | `watchlist_monitor` | `*/15 9-16 * * 1-5` | America/New_York |
| `weekly_digest.json` | `weekly_digest` | `0 9 * * 6` | America/New_York |
| `source_health.json` | `source_health` | `0 * * * *` | UTC |

Regenerate the files after editing schedules: `node services/workflows/generate.mjs`.

## Hosting n8n

There is no free hosted n8n assumed here. Options:
- **Local / your machine:** `docker compose --profile n8n up -d` (see the root `docker-compose.yml`).
- **Render:** n8n needs persistent storage (a paid disk or an external Postgres). Deploy the official image
  `docker.n8n.io/n8nio/n8n` as a web service with a disk mounted at `/home/node/.n8n`. This incurs cost.
- **n8n Cloud:** works too; set the same environment variables there.

## Required n8n environment

| Variable | Value |
|---|---|
| `ALPHAPULSE_API_URL` | Public API URL, e.g. `https://alphapulse-api.onrender.com` |
| `ALPHAPULSE_WEBHOOK_SECRET` | Same value as the API's `N8N_WEBHOOK_SECRET` (generate with `openssl rand -hex 32`) |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto` (the Code node uses it to sign requests) |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` (lets nodes read the two variables above) |
| `GENERIC_TIMEZONE` | `America/New_York` |

## Setup

1. Set `N8N_WEBHOOK_SECRET` on the API service and redeploy. `GET /api/v1/health` then reports `n8n: configured`.
2. In n8n: **Workflows → Import from file**, import each JSON file.
3. In AlphaPulse (admin): **Automations → Configure** each workflow, set **Status: Enabled** and **Triggered by: n8n**.
   Until you do, the API answers n8n with `409 workflow_not_enabled_for_n8n` and runs nothing.
4. Activate the workflows in n8n.
5. Verify: run one workflow manually in n8n (**Execute workflow**). The HTTP node should return
   `{"status":"succeeded", ...}` and the run appears under **Automations → Execution history** with trigger `n8n`.
   Running it again within the same window returns `{"status":"skipped","reason":"duplicate"}`.

## Security model

- Requests carry `X-AlphaPulse-Timestamp` and `X-AlphaPulse-Signature: sha256=HMAC(secret, timestamp + "." + body)`.
  The API rejects signatures that don't match or are more than 5 minutes old (constant-time comparison).
- The webhook only starts workflows that an administrator enabled for n8n; it accepts no other input.
- Runs are idempotent per schedule bucket (trading day, ISO week, 15-minute slot, hour), so n8n retries are safe.
- The endpoint is rate-limited like other expensive operations.

## Free-plan behaviour

On Render's free plan the API sleeps after 15 minutes idle. An n8n request wakes it; the first request can take about a
minute, which is why the HTTP node has a long timeout and three tries. The built-in scheduler (`SCHEDULER_ENABLED=true`)
is the alternative on an always-on paid instance.
