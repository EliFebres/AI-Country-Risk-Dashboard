// app/lib/dashboard-client.ts
//
// Shared client-side loader for the combined /api/dashboard payload
// (indicators + articles + summaries). Mirrors the RISK_CACHE singleton idiom in
// risk-client.ts: the dataset is global (all countries), so we fetch it ONCE per
// session, memoize it, and let every sidebar component read from it — replacing
// the old per-component fetches and ad-hoc caches. A single in-flight promise
// guard means concurrent callers (the map's background prefetch + a sidebar
// opening) share one network request instead of racing.
import type { CountryArticles } from "./risk-client";

export type IndicatorTargetName =
  | "Rule of law (z-score)"
  | "Inflation (% y/y)"
  | "Interest payments (% revenue)"
  | "GDP per-capita growth (% y/y)";

export type CountryIndicatorLatest = {
  iso2: string;
  name: string;
  values: Partial<
    Record<IndicatorTargetName, { year: number; value: number; unit?: string }>
  >;
};

export type SummaryEntry = { country_iso2: string; bullet_summary: string };

export type DashboardData = {
  indicators: CountryIndicatorLatest[];
  articles: CountryArticles[];
  summaries: SummaryEntry[];
};

export const DASHBOARD_JSON_PUBLIC_PATH = "/api/dashboard";

let DASHBOARD_CACHE: DashboardData | null = null;
let inFlight: Promise<DashboardData> | null = null;

/** Synchronous peek at the cached dashboard payload (null until loaded). */
export function getDashboardCache(): DashboardData | null {
  return DASHBOARD_CACHE;
}

/**
 * Fetch the combined dashboard payload once and memoize it. Concurrent callers
 * share the same in-flight request. No AbortSignal is wired into the shared
 * fetch on purpose — one caller unmounting must not cancel the load for others;
 * callers should guard their own post-await work with a `cancelled` flag.
 */
export async function loadDashboard(): Promise<DashboardData> {
  if (DASHBOARD_CACHE) return DASHBOARD_CACHE;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(DASHBOARD_JSON_PUBLIC_PATH, {
        cache: "force-cache",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Failed to load dashboard: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as DashboardData;
      DASHBOARD_CACHE = data;
      return data;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/* ------------------------------- accessors ------------------------------- */

/** Match an indicator entry by ISO2 first, falling back to country name. */
export function getIndicatorsFor(
  data: DashboardData,
  iso2?: string | null,
  name?: string | null
): CountryIndicatorLatest | undefined {
  const isoU = iso2 ? iso2.toUpperCase() : "";
  let hit = isoU
    ? data.indicators.find((c) => (c.iso2 || "").toUpperCase() === isoU)
    : undefined;
  if (!hit && name) {
    const n = name.trim().toLowerCase();
    hit = data.indicators.find((c) => c.name.trim().toLowerCase() === n);
  }
  return hit;
}

/** Match a country's article bundle by ISO2. */
export function getArticlesFor(
  data: DashboardData,
  iso2?: string | null
): CountryArticles | undefined {
  if (!iso2) return undefined;
  const isoU = iso2.toUpperCase();
  return data.articles.find((c) => (c.iso2 || "").toUpperCase() === isoU);
}

/** Match a country's AI summary by ISO2. */
export function getSummaryFor(
  data: DashboardData,
  iso2?: string | null
): SummaryEntry | undefined {
  if (!iso2) return undefined;
  const isoU = iso2.toUpperCase();
  return data.summaries.find((e) => (e.country_iso2 || "").toUpperCase() === isoU);
}
