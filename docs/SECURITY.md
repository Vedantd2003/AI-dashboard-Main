# Security

## Authentication
- Passwords hashed with **Argon2id** (`@node-rs/argon2`, memory 19 MiB, t=2, p=1 — OWASP minimum).
- Sessions: 256-bit random token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie. Only the SHA-256 of the token is stored
  (`sessions` collection, TTL index on `expiresAt`). Idle expiry 7 days, absolute 30 days. Logout deletes the session.
- No tokens in `localStorage`.
- Login rate-limited (10 / 15 min / IP+email) with uniform error messages; dummy hash verification on unknown emails to
  equalize timing.
- Email verification and password reset use single-use tokens (hashed, 1h TTL); only active when `RESEND_API_KEY` is set.
  Without email, recovery is admin-assisted (see Account recovery).

## CSRF
Cookie is `SameSite=Lax` and the web app is same-origin with the API via rewrite. Additionally every non-GET request must carry
`X-AlphaPulse-CSRF: 1` (a custom header cannot be sent cross-origin without a CORS preflight, which CORS rejects) **and** an
`Origin` matching `APP_BASE_URL` when an Origin header is present.

## Authorization
- `requireAuth` attaches `req.user` from the session; user IDs from the body/query are ignored.
- Every user-owned query filters by `userId`. Missing or foreign IDs both return 404 (no existence oracle).
- `role` is not accepted in any user-writable schema; only admins can change roles (`PATCH /admin/users/:id/role`), audited.

## Input & transport
Zod validation on every body/query/param; `express.json({ limit: '100kb' })`; uploads 10 MB via multer memory storage with MIME + magic-byte check;
`helmet` headers; CORS allow-list = `APP_BASE_URL` only; `express-rate-limit` globally and stricter on research/workflow runs;
Mongo query safety: `sanitizeFilter` + strict schemas, no `$where`, Zod rejects objects where strings are expected.

## Outbound requests (SSRF)
`safeFetch` resolves DNS, rejects private, loopback, link-local (incl. 169.254.169.254), CGNAT, multicast, IPv6 ULA, and
non-http(s) schemes; pins the resolved IP for the connection; follows ≤ 3 redirects re-validating each hop; 10s timeout;
5 MB body cap; content-type allow-list.

## Prompt injection
Retrieved/uploaded text is data. It is passed in `<source id=…>` delimited blocks, the system prompt instructs the model to
ignore instructions inside them, the model has **no tools**, and output is schema-validated and citation-checked.

## Webhooks
n8n → API calls are signed: `X-AlphaPulse-Signature: sha256=HMAC(N8N_WEBHOOK_SECRET, timestamp + "." + body)` with
`X-AlphaPulse-Timestamp` within ±5 minutes; constant-time compare. Outbound Slack/Discord URLs pass the SSRF guard.

## Secrets & logging
All secrets are server-side env vars validated at boot (production fails fast if required ones are missing).
`pino` with redaction of `password`, `token`, `cookie`, `authorization`, `*.apiKey`. Audit events for login, logout,
password change/reset, role change, workflow run, account deletion.

## Account recovery
1. With email configured: `POST /auth/password/forgot` → emailed single-use link → `POST /auth/password/reset`. All sessions revoked.
2. Without email: an admin runs `npm run admin:reset-link -w apps/api -- user@example.com`, which prints a single-use reset URL to
   the server console for out-of-band delivery after identity verification.

## Dependency hygiene
`npm audit --audit-level=high` in CI; Dependabot config included.
