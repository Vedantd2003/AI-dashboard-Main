# Design System — "Ledger Night"

The identity is a quiet, editorial dark ledger: serif headlines, tabular numerals, hairline rules, and colour used only to carry meaning.

## Reference board (owner-supplied, Oct 2026) — what we adopt and what we refuse
Five dark financial dashboards were supplied as inspiration (an "Investment Research" teal dashboard, a black bento
portfolio overview, an ETF portfolio-analysis tool, a "Shadow Research" console, and a "Prospera" portfolio app).
Mobbin was connected but unavailable (paid plan required), so these are the design inputs.

| Pattern seen | Adopted as |
|---|---|
| Bento grid of panels with a slim icon rail (refs 1, 4, 5) | 12-col workspace grid; collapsible left rail with labelled sections |
| KPI strip with inline sparklines (ref 4) | `KpiStrip` on Overview/Markets — every value from a live endpoint, sparkline from real history |
| Area chart with glow fill + crosshair tooltip (refs 1, 3, 5) | `PriceChart`: teal "signal" line, 12% gradient fill, crosshair with date/value readout |
| Allocation donut with % legend (refs 2, 3, 5) | Portfolio Lab allocation donut + legend table (accessible alternative) |
| Comparison table with coloured delta chips (refs 1, 5) | `DataTable` + `Delta` chips (sign + arrow + colour) |
| News list with category tags + relative time (ref 2) | Headlines panel: publisher, relative time, symbol tags, provider attribution |
| "Research mode — no orders, no execution" badge (ref 4) | Persistent `Research only · no trading` badge in the top bar |
| Risk guardrail progress bars (ref 4) | Portfolio concentration (HHI, top-holding weight) as labelled bars with thresholds |
| Market-status pill (ref 5) | Market session pill from the provider's market-status data, "unknown" when unavailable |
| Pill tab navigation (ref 2) | Sub-section tabs (e.g. Research: Runs / Sources / Uploads) |

Refused: scrolling ticker tapes, "AI Prediction 92%" / unexplained risk scores, gauges without a defined formula,
purple hero glow blobs, lorem-ipsum cards, profit figures not derived from user-entered positions, brand logos of listed companies.

## Colour tokens (CSS variables, `apps/web/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0F1A` | app background (midnight) |
| `--surface-1` | `#0F1624` | panels |
| `--surface-2` | `#151E30` | raised / hover |
| `--line` | `#22304A` | 1px hairlines |
| `--line-strong` | `#34476A` | focus-adjacent borders |
| `--ink` | `#EDE6D6` | primary text (warm ivory) |
| `--ink-2` | `#B3AFA4` | secondary text |
| `--ink-3` | `#7D8597` | tertiary / captions (≥4.5:1 on `--bg`) |
| `--up` | `#3FB68B` | positive change (restrained emerald) |
| `--down` | `#E06C6C` | negative change (muted red) |
| `--gold` | `#C9A45C` | premium highlight, focus ring, citations |
| `--warn` | `#D9A441` | stale data, not-configured |
| `--info` | `#6FA3D9` | links, neutral series |
| `--signal` | `#3CC8C0` | primary chart line / active nav (teal, from the reference board) |

Positive/negative is never conveyed by colour alone: values carry a sign and an arrow glyph.

Chart palette (categorical, in order): `#3CC8C0, #C9A45C, #6FA3D9, #B48EAD, #E0A96D, #7FB3B0`.

## Typography
- Display / headlines: **Fraunces** (serif), weights 400/600.
- UI / body: **Inter**, numbers rendered with `font-variant-numeric: tabular-nums`.
- Data / code: **JetBrains Mono**.
Fonts are self-hosted from `@fontsource-variable/*` npm packages (no runtime third-party font requests, no build-time Google fetch).

Scale (rem): 0.75 caption · 0.8125 small · 0.875 body-sm · 1 body · 1.25 h4 · 1.5 h3 · 2 h2 · 3 h1 · 4.25 display.

## Spacing & shape
4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96. Radii: 2px (controls), 6px (panels) — deliberately few rounded rectangles.
Panels are separated by hairlines, not shadows. One ambient radial glow at the top of the landing hero only.

## Components (`apps/web/components/ui`)
Button (primary / secondary / ghost / danger, sm / md), Input, Select, Textarea, Field (label + hint + error), Panel,
DataTable (sticky header, horizontal scroll on small screens, numeric right-align), Badge (freshness, status),
Skeleton, EmptyState, ErrorState, ConfirmDialog, Toast, Tabs, Delta (signed change with arrow), Sparkline,
PriceChart (Lightweight Charts with a visually-hidden data summary for screen readers), Citation chip.

## Motion
Framer Motion only for: page section reveal on the landing page (opacity/translate ≤ 12px, 240ms) and dialog/toast entry.
`prefers-reduced-motion` disables all of it. Numbers never animate.

## Focus & accessibility
2px gold focus ring with 2px offset on every interactive element; skip-link; semantic landmarks; charts expose a table alternative.
