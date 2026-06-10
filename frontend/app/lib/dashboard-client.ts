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

/**
 * One indicator reading. `value` is the freshest available — a sub-annual IMF
 * observation (with a precise `period`/`freq`/`source`) when present, otherwise
 * the latest World Bank annual value (`freq: 'A'`). `year` is always set.
 */
export type IndicatorValue = {
  value: number;
  unit?: string;
  year: number;
  period?: string;         // ISO date 'YYYY-MM-DD' end-of-period (sub-annual rows)
  freq?: "M" | "Q" | "A";
  source?: string;
};

export type CountryIndicatorLatest = {
  iso2: string;
  name: string;
  values: Partial<Record<IndicatorTargetName, IndicatorValue>>;
};

export type SummaryEntry = { country_iso2: string; bullet_summary: string };

/** One upcoming economic-calendar release (global, not per-country). */
export type EconCalendarEvent = {
  event_time: string;          // ISO 8601 UTC string
  country: string;             // display country name
  event: string;               // release / decision name
  importance: "h" | "m" | "l"; // FMP impact tier
};

/** One globally-ranked AI news alert (global, not per-country). */
export type NewsAlert = {
  global_rank: number;          // 1..N global importance rank
  country_iso2: string;         // originating country (ISO-2)
  country_name: string | null;  // display name
  url: string;                  // article link
  title: string | null;         // headline
  source: string | null;        // publisher
  published_at: string | null;  // ISO 8601 string
  topic: string;                // alert topic label
  severity: "Critical" | "Caution" | "Watch";
  importance: number | null;    // global-economy importance (0..1)
  rationale: string | null;     // one-line ranking rationale
  image_url: string | null;     // thumbnail URL
};

/** One year's cross-country average for an indicator (oldest→newest in a series). */
export type IndicatorAvgPoint = { year: number; avg: number };

/** Map of `indicator.name` → its average-per-year series, for the rail's trend dropdown. */
export type IndicatorAverageTrends = Record<string, IndicatorAvgPoint[]>;

export type DashboardData = {
  indicators: CountryIndicatorLatest[];
  indicatorAverages: IndicatorAverageTrends;
  articles: CountryArticles[];
  summaries: SummaryEntry[];
  econCalendar: EconCalendarEvent[];
  newsAlerts: NewsAlert[];
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

/** The cross-country indicator average-per-year trends (keyed by `indicator.name`). */
export function getIndicatorAverages(data: DashboardData): IndicatorAverageTrends {
  return data.indicatorAverages ?? {};
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
