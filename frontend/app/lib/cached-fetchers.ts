// app/lib/cached-fetchers.ts
//
// Shared `unstable_cache`-wrapped fetchers for the DB-backed API routes. Every
// route (and the combined /api/dashboard route) imports these SAME cache
// instances, so each topic hits Neon at most once per its own TTL no matter how
// many routes invoke it. Keep the cache keys/tags here in sync with the per-topic
// revalidate tags used elsewhere.
import "server-only";
import { unstable_cache } from "next/cache";
import { riskRepository } from "@/app/lib/risk-server";
import { resolveCoords } from "@/app/lib/country-coords";
import { CACHE_TTL } from "@/app/lib/cache-ttl";
import type { CountryRisk } from "@/app/lib/risk-client";

/** Latest risk score + history per country, with map coordinates resolved. */
export const getRisks = unstable_cache(
  async (): Promise<CountryRisk[]> => {
    const joined = await riskRepository.fetchJoinedLatestRisks();
    const out: CountryRisk[] = [];

    for (const row of joined) {
      const lngLat = resolveCoords(row.iso2, row.name);
      if (!lngLat) continue; // no known map position; skip (matches prior behavior)

      const list = Array.isArray(row.prev_scores)
        ? row.prev_scores.map(Number).filter((x) => Number.isFinite(x))
        : [];
      // (defensive) if list missing but prev_score exists, include it
      if (list.length === 0 && row.prev_score != null) {
        const n = Number(row.prev_score);
        if (Number.isFinite(n)) list.push(n);
      }

      const entry: CountryRisk = {
        name: row.name,
        lngLat,
        risk: Number(row.score),
        iso2: row.iso2,
      };
      if (list.length > 0) {
        entry.prevRiskSeries = list; // newest→oldest, excluding current
        entry.prevRisk = list[0];
      }
      out.push(entry);
    }

    return out;
  },
  ["risk-data"],
  { revalidate: CACHE_TTL.RISK, tags: ["risk"] }
);

/** Latest year/value for the four target indicators, per country. */
export const getIndicators = unstable_cache(
  async () => riskRepository.fetchLatestIndicatorValues(),
  ["indicators-latest"],
  { revalidate: CACHE_TTL.INDICATORS, tags: ["indicators"] }
);

/** Top-3 articles per country's latest snapshot. */
export const getArticles = unstable_cache(
  async () => riskRepository.fetchLatestArticlesForLatestSnapshots(),
  ["articles-latest"],
  { revalidate: CACHE_TTL.ARTICLES, tags: ["articles"] }
);

/** Latest non-empty AI bullet summary per country. */
export const getSummaries = unstable_cache(
  async () => riskRepository.fetchLatestSummaries(),
  ["risk-summaries"],
  { revalidate: CACHE_TTL.RISK_SUMMARY, tags: ["risk-summary"] }
);

/** Up to 12 upcoming (next 7 days) economic-calendar events, closest first. */
export const getEconCalendar = unstable_cache(
  async () => riskRepository.fetchEconCalendarEvents(),
  ["econ-calendar-upcoming"],
  { revalidate: CACHE_TTL.ECON_CALENDAR, tags: ["econ-calendar"] }
);

/** Latest run's globally-ranked AI news alerts, ordered by global rank. */
export const getNewsAlerts = unstable_cache(
  async () => riskRepository.fetchLatestNewsAlerts(),
  ["ai-alerts-latest"],
  { revalidate: CACHE_TTL.AI_ALERTS, tags: ["ai-alerts"] }
);
