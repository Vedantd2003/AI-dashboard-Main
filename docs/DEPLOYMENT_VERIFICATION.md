# Deployment verification report

Generated 23 October 2026 (IST) from the build sandbox. Every "verified" line below was executed and observed;
anything not executed is marked as such. Nothing here was inferred from a successful build alone.

## Summary

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | GitHub repository exists | **Not yet**: needs the owner to create it | Connected account `Vedantd2003` has no `alphapulse-ai` repo; the sandbox cannot create repositories |
| 2 | Latest code pushed | **Not yet**: blocked by #1 | 11 local commits on `main` |
| 3 | Render frontend deployed | **Not yet**: blocked by #1 and MongoDB Atlas URI | Render workspace `My Workspace` is reachable through the Render connector |
| 4 | Render API deployed | **Not yet**: same | — |
| 5 | Public frontend URL responds | Not applicable until #3 | — |
| 6 | API health endpoint responds | **Verified locally** | `GET /api/v1/health` → 200 `{"status":"ok","database":{"state":"connected"}}` from the compiled `dist/server.js` against MongoDB 8.0.23 |
| 7 | Database connectivity | **Verified locally** | Same; indexes synced at boot; 45 integration tests on a real `mongod` |
| 8 | Authentication | **Verified locally** (API tests + browser e2e) | Register, login, logout, expiry, reset, CSRF, isolation |
| 9 | Market provider connectivity | **Not verified against real providers**: no keys in sandbox and outbound access blocked | Adapters verified with mocked HTTP; UI verified with the fixture providers |
| 10 | AI research | **Pipeline verified with a deterministic fake model**; real OpenRouter not called | Citation verification, downgrade of fabricated evidence, repair-once, data-only fallback |
| 11 | Source citations render | **Verified** in the browser | Playwright opens a citation and asserts the passage appears |
| 12 | Scheduled workflows via n8n | **Signing and webhook verified**; no n8n instance was run | The generated n8n Code node was executed verbatim against the API: 409 when not enabled, 200 succeeded, then 200 skipped as duplicate |
| 13 | Notifications | **In-app verified**; email/webhook verified with mocked providers only | Delivery statuses `delivered` / `skipped` / `failed` asserted per channel |
| 14 | Production build and automated tests | **Verified** | See below |

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

Requires the owner:
1. Create an empty GitHub repository (e.g. `Vedantd2003/alphapulse-ai`); the code can then be pushed from here.
2. Create a MongoDB Atlas cluster and provide `MONGODB_URI`.
3. Provide provider keys as desired: `TWELVE_DATA_API_KEY`, `FINNHUB_API_KEY`, `SEC_USER_AGENT`,
   `OPENROUTER_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, `N8N_WEBHOOK_SECRET`.
4. Optionally host n8n (see `services/workflows/README.md`).

Once 1 and 2 exist, the Render services can be created on the free plan and checks 3–5 and 9–13 run against the live URLs.
