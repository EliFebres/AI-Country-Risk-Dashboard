# REFACTOR_BASELINE — Behavior Contract

Snapshot of `frontend/` **before** the `refactor/frontend` work. Every item here must remain
true (same surface / same behavior) after the refactor, or be documented as an intentional
consolidation. Captured on branch `dev` (base commit `de94241`).

## Regression baseline (tooling)

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | ✅ exit 0 (clean) |
| Build | `npx next build` | ✅ compiles; 9 routes generated; First Load JS shared ≈ 102 kB; `/` ≈ 1.26 kB / 103 kB |
| Lint | `npm run lint` (`next lint`) | ⚠️ **Not configured** — no ESLint config exists; `next lint` only offers interactive setup (exits non-zero without a config). No lint baseline to preserve. |

There is **no test script**. The build performs its own type-check (also clean).

## API routes (must keep exact path / method / status / shape)

All five are `GET`, `export const runtime = "nodejs"`, success = `NextResponse.json(data, { status: 200 })`,
error = `NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })`.

| Path | Fetcher | Success body |
|---|---|---|
| `GET /api/risk` | `getRisks()` | `CountryRisk[]` — `{ name, lngLat:[lng,lat], risk:number, iso2?, prevRisk?, prevRiskSeries?:number[] }` |
| `GET /api/risk-summary` | `getSummaries()` | `SummaryEntry[]` — `{ country_iso2, bullet_summary }` (**currently unused by UI — keep anyway**) |
| `GET /api/articles` | `getArticles()` | `CountryArticles[]` — `{ iso2, name, as_of, articles:{ url, title?, source?, published_at?, img_url? }[] }` |
| `GET /api/indicators` | `getIndicators()` | `CountryIndicatorLatest[]` — `{ iso2, name, values: Partial<Record<IndicatorTargetName,{year,value,unit?}>> }` |
| `GET /api/dashboard` | `Promise.all([getIndicators,getArticles,getSummaries])` | `{ indicators, articles, summaries }` (no risk) |

## Caching (must keep exact keys / TTLs / tags)

`unstable_cache` (server) in `lib/cached-fetchers.ts`, TTLs in `lib/cache-ttl.ts`:

| Fetcher | Key | `revalidate` | Tag |
|---|---|---|---|
| `getRisks` | `["risk-data"]` | `CACHE_TTL.RISK` = 12h (43200s) | `["risk"]` |
| `getIndicators` | `["indicators-latest"]` | `CACHE_TTL.INDICATORS` = 24h (86400s) | `["indicators"]` |
| `getArticles` | `["articles-latest"]` | `CACHE_TTL.ARTICLES` = 6h (21600s) | `["articles"]` |
| `getSummaries` | `["risk-summaries"]` | `CACHE_TTL.RISK_SUMMARY` = 12h (43200s) | `["risk-summary"]` |

Placeholders (no backend yet): `ECON_CALENDAR` 12h, `AI_ALERTS` 1h, `PRICES` 5m.

Client caches: `risk-client.ts` `RISK_CACHE` singleton (`primeRiskCache`/`getRiskCache`);
`dashboard-client.ts` `DASHBOARD_CACHE` + `inFlight` dedupe (`loadDashboard` once per session).

## Database (must keep SQL byte-for-byte)

Neon pool singleton `global.__NEON_POOL__` via `getPool()` (`DATABASE_URL`, `ssl.rejectUnauthorized:false`).
Functions in `risk-server.ts` (→ to become `RiskRepository` methods, identical SQL):
`fetchCountriesFromDB`, `fetchLatestRiskSnapshotsFromDB`, `fetchJoinedLatestRisksFromDB`,
`fetchLatestSummariesFromDB`, `fetchLatestIndicatorValuesFromDB`,
`fetchLatestArticlesForLatestSnapshotsFromDB`.
Tables: `country`, `risk_snapshot`, `risk_snapshot_article`, `indicator`, `yearly_value`.
`INDICATOR_TARGET_NAMES` = the 4 target indicators (exact strings).

## Pages & data flow

- `app/page.tsx` → `<MapClient/>` → dynamic `import('./TerminalDashboard', { ssr:false })`.
- `app/layout.tsx` → Geist fonts + `globals.css`.
- Map loads `/api/risk` (`force-cache`) → primes `RISK_CACHE` → `onData(rows, ts)`; background prefetch `/api/dashboard`.
- Sidebar sections read from `DASHBOARD_CACHE` via `getIndicatorsFor`/`getArticlesFor`/`getSummaryFor` (no per-country refetch).

## Components (21) — keep prop surface or document consolidation

`MapClient`, `TerminalDashboard`, `Masthead(coverage,dataTimestamp?,idleEnabled,onToggleIdle)`,
`Map(onSelectCountry,onData?,bounds?,center?,zoom?)`, `MapFullscreenButton(minimized,onToggle)`,
`WorldRiskIndexRail(rows,onSelectCountry,onMeasure?)`,
`RiskSidebar(open,onClose,country,dataTimestamp?,durationMs?,easing?)`,
`RiskReadingSection(countryName?,iso2?,active?,currentRisk?,prevRisk?)`,
`EconomicGaugeSection(iso2?,active?)`, `AiSummary(iso2?,active?)`, `NewsArticleSection(iso2?,active?)`,
`BottomBar(rows,onSelectCountry)`, `AIAlerts(rows,onSelectCountry)`, `EconCalendar()`, `Prices()`,
`WorldMarkets()`, `LiveTV()`.

## Behavior invariants (must not change)

- MapLibre: style `https://tiles.openfreemap.org/styles/dark`; minZoom 2 / maxZoom 4.5; focus zoom 3.5;
  country-only labels (English) + admin_level 2 borders + hidden roads; markers 26px ring, click→select.
- Idle auto-tour: start 5000ms, interval 40000ms, pan 3000ms; resets on pointer/mouse/key/wheel/touch;
  pauses on tab hidden; random country ≠ current; localStorage `crd_idle_tour`.
- Risk colors: >0.70 `#ff2d55`, 0.50–0.70 `#ffd60a`/`--risk-elev`, <0.50 `#39ff14`.
- `COUNTRY_COORDS` (40 countries) + `resolveCoords` fallback; countries w/o coords are skipped in `getRisks`.
- Bottom bar seed data (`terminal-seed.ts`): alerts, calendar, prices (4s random walk), world-markets clock, live-TV channels.
- localStorage: bottom-bar minimized state, idle-tour toggle.

## Dependency note

`cheerio` and `@vercel/blob` are present in `package.json` but imported nowhere in the repo →
**to be removed** (documented dependency change). No scraping/blob code runs in `frontend/`.
