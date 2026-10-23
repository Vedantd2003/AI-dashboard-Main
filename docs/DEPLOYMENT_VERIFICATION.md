# Deployment verification report

Generated 23 October 2026 (IST) from the build sandbox. Every "verified" line below was executed and observed;
anything not executed is marked as such. Nothing here was inferred from a successful build alone.

## Summary

Live deployment (Render, free plan, Singapore), deployed from branch `alphapulse-ai` of
`Vedantd2003/AI-dashboard-Main` at commit `7164123`.

| Service | URL | Status |
|---|---|---|
| Web | https://alphapulse-web.onrender.com | **Live**: landing page renders, no errors |
| API | https://alphapulse-api.onrender.com | **Live**: logs show `connected to MongoDB` and `AlphaPulse API listening` |
| API docs | https://alphapulse-api.onrender.com/api/v1/docs | Served by the live API |

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | GitHub repository exists | **Verified** | Branch `alphapulse-ai` on `Vedantd2003/AI-dashboard-Main` (the intended `alphapulse-ai` repo was not reachable by this session) |
| 2 | Latest code pushed | **Verified** | Remote branch hash equals local `HEAD` |
| 3 | Render frontend deployed | **Verified** | Deploy `dep-dbdncfjrjlhs73dt9s0g` status `live` |
| 4 | Render API deployed | **Verified** | Deploy `dep-dbdncc8n74is739d39lg` status `live` |
| 5 | Public frontend URL responds | **Verified** | External fetch of `/` returned the landing page |
| 6 | API health endpoint responds | **Verified** | `GET https://alphapulse-web.onrender.com/api/v1/health` (through the web proxy) → status `ok` |
| 7 | Database connectivity (Atlas) | **Verified** | Health reports database `connected`, ping 63 ms |
| 8 | Authentication in production | **Not yet observed live** | Verified locally and in e2e; first live sign-up is the next check |
| 9 | Market provider connectivity | Not configured | No `TWELVE_DATA_API_KEY` / `FINNHUB_API_KEY` |
| 10 | AI research | Not configured | No `OPENROUTER_API_KEY`; reports run in data-only mode |
| 11 | Source citations render | Verified in browser e2e (fixture data) | — |
| 12 | Scheduled workflows via n8n | Not configured | No n8n instance or `N8N_WEBHOOK_SECRET` |
| 13 | Notifications | In-app only | No email provider configured |
| 14 | Production build and automated tests | **Verified** | See below; Render built both services successfully |

## Test results (executed)

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` (3 workspaces) | clean |
| `packages/shared` Vitest | **41 passed** |
| `apps/api` Vitest (unit + integration, real MongoDB 8.0.23) | **81 passed** (36 unit, 45 integration) |
| `apps/web` Vitest + Testing Library | **22 passed** |
| `apps/web` Playwright (desktop + mobile, fixture stack) | **6 passed** |
| `npm run build:api`, `next build` | succeeded (21 routes) |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

## Browser QA (executed with Chromium 141)

All 12 primary routes captured at 1440×900 and 390×844, both with no integrations configured and with fixture data.
Defects found and fixed during QA:

1. Not-configured responses were retried, leaving the Headlines widget stuck on a skeleton. Retries now skip them.
2. A visually hidden table header escaped its scroll container and widened the mobile Settings page by 211 px. Fixed.
3. **Unique index on `shareToken` collided on `null`**: every user's second report failed with 409. Partial index,
   migration `002-unset-null-share-tokens`, and a regression test added.
4. **Concurrent upserts of the same source raced on the unique index** (E11000). Upserts now retry; regression test added.
5. The "claims verified" badge counted interpretations; it now counts sourced claims only.

After fixes: no horizontal overflow on any route at either width; the only HTTP 5xx in the console is the intentional
503 for SEC filings while `SEC_USER_AGENT` is unset.

## Remaining setup

1. Optional provider keys (Render → alphapulse-api → Environment): `TWELVE_DATA_API_KEY`, `FINNHUB_API_KEY`,
   `OPENROUTER_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, `N8N_WEBHOOK_SECRET`.
2. Rotate the Atlas database user password (it was shared in chat) and update `MONGODB_URI` on the API service.
3. Move the code to its own repository when one is reachable, and repoint both Render services to it.
