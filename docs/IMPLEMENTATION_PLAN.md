# Implementation Plan

| Stage | Output | Verification |
|---|---|---|
| 0 | Environment discovery, docs | — |
| 1 | `packages/shared`: schemas, analytics, alerts, dedupe, citations | `vitest` unit tests, `tsc --noEmit` |
| 2 | `apps/api`: config, models, auth, markets, watchlists, portfolios, alerts, notifications | unit + integration tests (`supertest`, `mongodb-memory-server`) |
| 3 | `apps/api`: ingestion (SSRF guard, EDGAR, Finnhub news, RSS, uploads), research pipeline, workflows, OpenAPI | tests with mocked providers |
| 4 | `apps/web`: design system, landing, auth, workspace sections | `next build`, component tests |
| 5 | n8n workflows, `render.yaml`, CI, README | JSON validity, YAML lint |
| 6 | Local run + browser QA; GitHub push; Render deploy | only where credentials/authorization exist |

## Environment constraints found in the build sandbox (Oct 2026)
- MongoDB download hosts and Docker were unavailable; a MongoDB 8.0.23 server was obtained from conda-forge, so all
  integration tests ran against a real `mongod` (via `MONGOMS_SYSTEM_BINARY`). CI uses `mongodb-memory-server`'s own download.
- Outbound calls to market/LLM APIs are blocked from the sandbox; provider adapters are tested with mocked `fetch`,
  and UI QA used the fixture server (`apps/api/test/fixture-server.ts`).
- The sandbox's GitHub token is invalid, so pushing requires the owner's authorization.

## Schema changes
Every model carries `schemaVersion`. `npm run db:indexes -w apps/api` syncs indexes idempotently.
Migrations live in `apps/api/src/db/migrations/NNN-name.ts` and are run by `npm run db:migrate`, recorded in a `migrations` collection.
