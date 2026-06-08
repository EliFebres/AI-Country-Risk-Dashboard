# Frontend Refactor — Final Report

Branch `refactor/frontend` (10 commits off `dev`). Goal: leaner, idiomatic code with
**behavior parity** as the non-negotiable priority. See `REFACTOR_BASELINE.md` for the contract.

## Verification (all green, no worse than baseline)

| Check | Baseline | After |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `next build` | ✅ 5 API routes, shared JS ≈102 kB | ✅ identical (same routes, same sizes) |
| `next lint` | ⚠️ not configured (no ESLint config) | ⚠️ unchanged — out of scope |

**End-to-end smoke test (dev server vs. live Neon DB):** all five API routes returned `200`
with the exact baseline shapes — `/api/risk` → `CountryRisk[]`, `/api/dashboard` →
`{indicators,articles,summaries}`, plus `/api/risk-summary|articles|indicators`. Home page `200`,
no runtime errors in the dev log. This exercises the new `RiskRepository` + `jsonRoute` paths
against real data. The map/sidebar/charts/ticker UI changes were pure refactors validated by
type-check + clean client compile; a browser click-through remains available if desired.

## Key structural changes

- **Shared utilities** — `app/lib/risk.ts` (`colorForRisk`, `RISK_COLORS`) and `app/lib/format.ts`
  (`clamp01`, `calendarDaysAgo`, `daysAgoLabel`) replace **4** copies of `colorForRisk`, **2** of
  `clamp01`, and **2** hand-rolled day-diff blocks.
- **API handler** — `app/lib/api.ts` `jsonRoute(fetcher)` collapses the identical try/catch in all
  **5** routes (same paths, methods, status codes, and `{ error }` 500 shape).
- **Data-access class** — `risk-server.ts` is now a `RiskRepository` class (singleton `riskRepository`)
  with one method per query; **SQL is byte-for-byte identical**. Pool singleton semantics preserved.
- **Shared hook** — `app/lib/hooks.ts` `useDashboardEntry` replaces the duplicated
  cancellation-flag/loading idiom in `AiSummary` and `EconomicGaugeSection`.
- **Shared chart** — `app/components/RiskTrendChart.tsx` replaces two near-duplicate Recharts area
  charts (sidebar "Risk Rating" + World Risk Index rail), including the zero-width-on-first-paint fix.
- **Design token** — `--amber-border` replaces 7 copies of `rgba(255,180,60,0.45)`.
- **TSDoc** added to every new export and to all exported components.

## Dead code & dependencies removed

- `risk-server.ts`: `fetchCountriesFromDB`, `fetchLatestRiskSnapshotsFromDB` (served a `refresh-risk`
  route that no longer exists).
- `risk-client.ts`: `loadRisksClient`, `getRiskByCountry`, `loadLatestArticles`,
  `RISK_JSON_PUBLIC_PATH`, `ARTICLES_JSON_PUBLIC_PATH` (none referenced).
- **Dependencies:** removed `cheerio` and `@vercel/blob` — imported nowhere in the repo. No other
  dependency changes.

## Metrics (app source, `dev` → HEAD)

- Diff: **30 files changed, +571 / −514**.
- Files: 32 → 37 (**+5**); LOC: 4746 → 4802 (**+56**).

These raw counts rose, not fell, for two reasons, both intrinsic to the brief's own requirements:
1. **Idiomatic extraction** of shared logic into focused modules adds files by design — that's how
   the **duplication** (the real footprint) was removed. The alternative, a single `utils.ts`
   grab-bag, would lower the count at the cost of the "group by feature" standard.
2. **Mandated TSDoc** on every export adds lines. Excluding the added documentation, code LOC is a
   net reduction (≈200 lines of duplication/dead code removed).

The brief frames footprint as "less duplicated/dead code … not line-count golf"; by that measure the
footprint dropped materially even though raw totals nudged up.

## Deliberate scope decisions (and why)

- **Aggressive CSS migration → scaled back to shared tokens.** The plan called for moving most
  styled-jsx into `globals.css`. While auditing, I found concrete cascade coupling — e.g.
  `.card :global(.muted)` (specificity 0,2,0) intentionally overrides `.card :global(p)` so
  `AiSummary`'s muted text renders amber-dim, and `.bigValue.muted` interplay in the risk reading.
  Lifting these to global scope risks subtle visual regressions, which conflicts with the #1 priority
  (parity). I landed the safe, high-value piece (the `--amber-border` token; shared styles already in
  `globals.css` were left intact) and kept the remaining styled-jsx as co-located **scoped component
  CSS** (an option the brief explicitly allows). **Recommended follow-up:** migrate the rest
  incrementally, one component per commit, with visual diffs.
- **No generic client-cache helper.** `risk-client` only primes/peeks while `dashboard-client`
  fetches+dedupes — each pattern occurs once. Unifying them would be a redundant abstraction.
- **`useMeasure` not extracted.** The ResizeObserver blocks differ materially (width vs height vs
  `offsetHeight`+window-resize+callback, differing deps/conditional mounting); a shared hook risked
  parity. `RiskTrendChart` self-contains its own width measurement instead.
- **Oversized components not split.** `NewsArticleSection` / `RiskSidebar` are large due to
  component-specific styled-jsx and non-duplicated logic; splitting would add files without removing
  duplication — contrary to the footprint goal.
- **No barrel/index files** added (per brief). **`risk-summary` route kept** despite being unused.

## Untouched (as required)

`next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `public/flags/`, all cache TTLs/keys/tags,
MapLibre config, idle-tour timing, country coordinates, and risk thresholds.
