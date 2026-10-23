# Data Sources

Researched October 2026. Plans change — re-check before relying on any limit.

| Source | Used for | Auth | Limits (free) | Terms that matter |
|---|---|---|---|---|
| **Twelve Data** | symbol search, quote, daily/intraday history | `TWELVE_DATA_API_KEY` | 800 requests/day, 8 credits/min; US equities only on Basic | Basic is for *internal non-display use*. Displaying data publicly requires a paid plan with display rights. |
| **Finnhub** | company news, company profile, basic financial metrics | `FINNHUB_API_KEY` | ~60 calls/min | Free key is personal / non-commercial. |
| **SEC EDGAR** (`data.sec.gov`) | filings index (10-K, 10-Q, 8-K) for US issuers | none; descriptive `User-Agent` with contact email required (`SEC_USER_AGENT`) | 10 requests/second max | Public data; fair-access policy applies. |
| **User RSS feeds** | additional news | none | app-side: 1 req/feed/15 min | Only feeds the user adds; robots/terms are the user's responsibility; fetched through the SSRF guard. |
| **User uploads** | PDFs / text research documents | session | 10 MB, PDF/TXT/MD | Treated as untrusted input. |
| **OpenRouter** | LLM (structured outputs) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | pay-per-token | Requests set `provider.require_parameters: true` so only endpoints supporting `json_schema` are used. |

## Licensing warning for a public deployment
Free Twelve Data and Finnhub keys do not grant public redistribution/display rights. A public demo on free keys is a
licensing question for the deployer. The app shows provider attribution on every data surface and the README calls this out.

## Indian markets (NSE/BSE)
Neither exchange publishes a documented free public API for programmatic use, and their websites restrict automated access.
AlphaPulse does **not** scrape them. Indian symbols are supported only to the extent a configured provider covers them
(Twelve Data paid plans cover NSE/BSE). Otherwise the UI states the market is unsupported by the configured provider.

## Freshness labels
- `realtime` — only when the provider marks it so (never on free plans here).
- `delayed` — intraday quotes on free plans.
- `eod` — daily bars.
Every quote/series response carries `provider`, `asOf` (provider timestamp), `retrievedAt`, and `freshness`.

## What the app never does
Bypass authentication, paywalls, CAPTCHAs or robots rules; fabricate a value when a provider lacks it.
