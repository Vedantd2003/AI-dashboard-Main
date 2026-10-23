# AlphaPulse AI — Product Requirements

> From market signals to investment intelligence.

AlphaPulse AI is a research and decision-support product. It is **not** a broker, does not place trades,
does not rebalance portfolios, and never promises returns.

## Users
Individual investors, equity/financial analysts, research teams, financial content creators, founders tracking markets,
and developers studying AI-powered financial systems.

## Jobs to be done
1. *Investigate a company* — quote, history, profile, fundamentals, news, filings, all with provider attribution and freshness.
2. *Track what matters* — multiple watchlists with notes and rule-based alerts (price threshold, % move).
3. *Ask an analyst* — a research question returns a structured, cited report that separates observed data,
   source-reported statements, calculated metrics, model interpretation and speculation.
4. *Automate recurring research* — daily brief, watchlist monitor, weekly digest, data-source health — via n8n or a built-in scheduler.
5. *Learn from a hypothetical portfolio* — value, cost basis, P&L, allocation, concentration, drawdown, correlation.

## Functional requirements (MVP = shipped in this repo)
| Area | Requirement | Status |
|---|---|---|
| Auth | Register, login, logout, session expiry, Argon2id hashing, HTTP-only cookies, roles (user/admin) | MVP |
| Auth | Email verification + password reset | Implemented; active only when an email provider is configured |
| Markets | Symbol search, quote, history with range selection, profile, metrics, attribution, timestamps, caching, retries | MVP |
| Watchlists | CRUD, items, notes, per-user isolation | MVP |
| Alerts | Price above/below, % move; dedupe via cooldown + idempotency key | MVP |
| Notifications | In-app; email (Resend) and Slack/Discord webhooks when configured; delivery attempts stored | MVP |
| Research | Pipeline: normalize → data → sources → dedupe/rank → LLM structured output → citation validation → persist | MVP |
| Ingestion | SEC EDGAR filings, Finnhub company news, user RSS feeds, PDF/text uploads; SSRF guard | MVP |
| Analytics | Returns, vol, SMA/EMA, RSI, max drawdown, correlation, rolling vol, benchmark comparison | MVP |
| Portfolio Lab | Hypothetical positions, valuation, allocation, HHI concentration, history, drawdown | MVP |
| Workflows | 4 workflow definitions, run history, manual rerun, enable/disable, idempotency, signed webhooks, n8n JSON | MVP |
| Reports | Daily brief view, search, copy summary, print-to-PDF, source review, compare by date | MVP |

## Non-goals
Trading, brokerage linking, tax computation, investment recommendations tailored to an individual, real-time tick data.

## Honesty requirements (product invariants)
- No hardcoded values shown as live data. If a provider is not configured, the UI says so.
- Delayed / end-of-day data is labeled; real-time is never claimed unless the provider says so.
- Citations are only attached when the retrieved passage exists in stored source content; otherwise claims are marked *unverified*.
- Model "confidence" is shown as a qualitative label, never as a probability.
- Delivery status is only "delivered" after the provider returns success.
- Every AI output carries a not-financial-advice disclaimer.
