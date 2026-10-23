# System Architecture

```
                ┌───────────────────────────── Render ─────────────────────────────┐
 Browser ──────▶│  apps/web  (Next.js, App Router)                                  │
  (same-origin  │    /            marketing                                         │
   cookies)     │    /app/*       authenticated workspace                           │
                │    /api/v1/*  ──rewrite──▶  apps/api (Express, TS)                │
                │                                 │                                 │
                │                                 ├─ services (markets, research,   │
                │                                 │   alerts, workflows, ingest)    │
                │                                 ├─ in-process scheduler (opt.)    │
                │                                 └─ /api/v1/hooks/n8n/* (HMAC)  ◀──┼── n8n (self-hosted, optional)
                └─────────────────────────────────┬─────────────────────────────────┘
                                                  │
        MongoDB Atlas ◀───────────────────────────┤
        Twelve Data · Finnhub · SEC EDGAR · RSS ◀─┤  (server-side only; keys never reach the browser)
        OpenRouter (LLM) ◀────────────────────────┤
        Resend (email) · Slack/Discord webhooks ◀─┘
```

## Why the web app proxies the API
`*.onrender.com` is on the Public Suffix List, so a web service and an API service on two onrender.com subdomains are
**cross-site**. Cross-site cookies need `SameSite=None` and are blocked by browsers with third-party-cookie protection.
The Next.js app therefore rewrites `/api/v1/*` to the API's URL server-side (`API_BASE_URL`), so the session cookie is
first-party with `SameSite=Lax`. The browser never needs the API origin; there is no `NEXT_PUBLIC_*` secret.

## Packages
| Path | Role |
|---|---|
| `packages/shared` | Zod schemas (API contracts, research report schema), deterministic analytics, alert rules, dedupe, citation validation. Pure TS, unit-tested. |
| `apps/api` | Express app: config (fail-fast Zod env), Mongoose models, repositories via models, services, routes, OpenAPI, scheduler. |
| `apps/web` | Next.js UI: design system components, TanStack Query data layer, Lightweight Charts. |
| `services/workflows` | n8n importable workflow JSON + setup notes. |

## Layering in the API
`routes → (validate with Zod) → services → models/providers`. Routes never touch providers directly.
All user-owned queries include `{ userId: req.user.id }` taken from the server-side session, never from the request body.

## Queueing
Redis/BullMQ is used **only** when `REDIS_URL` is set. Without it the API uses an in-process job runner with a Mongo-backed
execution log and idempotency keys. This is a single-instance runner and is documented as such — it is not a distributed queue.

## Caching
Provider responses are cached in-process (LRU with TTL per endpoint: quote 60s, history 15m, profile 24h) to stay under
free-tier rate limits. Cache entries carry the provider timestamp so freshness is always shown.

## Research pipeline
1. Validate request (Zod), normalize symbols (uppercase, `[A-Z0-9.\-]{1,12}`).
2. Market data per symbol (quote, 1Y daily history, profile, metrics) — failures recorded as limitations, not fabricated.
3. Sources: Finnhub company news (7–30 days), SEC submissions (recent 10-K/10-Q/8-K), user-uploaded docs.
4. Dedupe (canonical URL + title shingle similarity), rank (recency × relevance × primary-source boost), cap at N.
5. Deterministic metrics from `@alphapulse/shared/analytics`.
6. LLM call with `response_format: json_schema` (strict). Untrusted source text is wrapped in delimited blocks and the system
   prompt states that instructions inside sources must be ignored.
7. Validate with Zod; one repair attempt on failure.
8. Citation validation: each `sourceId` must exist; each quoted `evidence` passage must appear (normalized) in that source's stored text.
   Claims failing validation are downgraded to `unverified`.
9. Persist `researchRuns` (process metadata) and `researchReports` (result).

## Data model (collections)
users, sessions (TTL), watchlists (items embedded — bounded ≤ 100), portfolios (positions embedded — bounded ≤ 200),
researchRuns, researchReports, sourceDocuments (unique `contentHash`), alerts, alertEvents (unique idempotency key),
notifications (+ deliveries[]), workflowDefinitions, workflowExecutions (unique idempotency key), providerHealth, auditEvents (TTL 365d).

`watchlistItems` and `portfolioPositions` are embedded arrays rather than separate collections: they are always read with
their parent and are bounded, which avoids an extra round-trip and orphan cleanup.
