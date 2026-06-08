// app/lib/risk-client.ts
export type CountryRisk = {
  name: string;
  lngLat: [number, number]; // [lng, lat]
  risk: number;             // 0..1 (current risk)
  prevRisk?: number;        // previous single value (convenience)
  prevRiskSeries?: number[]; // NEW: all prior scores, newest→oldest (excludes current)
  iso2?: string;            // populated by weekly refresh
};

export const RISK_JSON_PUBLIC_PATH = "/api/risk";

/**
 * Shared in-memory cache of the fresh risk dataset. The map fetches risk.json
 * once (with a cache-buster) and primes this; other client components read it
 * instead of re-fetching, avoiding a stale-CDN divergence.
 */
let RISK_CACHE: CountryRisk[] | null = null;
export function primeRiskCache(rows: CountryRisk[]): void {
  RISK_CACHE = rows;
}
export function getRiskCache(): CountryRisk[] | null {
  return RISK_CACHE;
}

/** Load risks in the browser (Client Components / useEffect). */
export async function loadRisksClient(signal?: AbortSignal): Promise<CountryRisk[]> {
  const res = await fetch(RISK_JSON_PUBLIC_PATH, { cache: "force-cache", signal });
  if (!res.ok) throw new Error(`Failed to load risks: ${res.status} ${res.statusText}`);
  return (await res.json()) as CountryRisk[];
}

/**
 * Find a country in loaded data by name. Summaries now come straight from the
 * DB-backed GET /api/risk-summary route, so there is no server-side write here.
 */
export function getRiskByCountry(
  data: CountryRisk[],
  name: string
): CountryRisk | undefined {
  const key = name.trim().toLowerCase();
  return data.find(d => d.name.trim().toLowerCase() === key);
}

// ----------------------------- Latest articles ----------------------------

export type CountryArticles = {
  iso2: string;
  name: string;
  as_of: string;
  articles: {
    url: string;
    title?: string | null;
    source?: string | null;
    published_at?: string | null;
    img_url?: string | null;
  }[];
};

export const ARTICLES_JSON_PUBLIC_PATH = "/api/articles";

/** Load latest 0–3 articles for each country (based on latest snapshot date). */
export async function loadLatestArticles(signal?: AbortSignal): Promise<CountryArticles[]> {
  const res = await fetch(ARTICLES_JSON_PUBLIC_PATH, { cache: "force-cache", signal });
  if (!res.ok) throw new Error(`Failed to load articles: ${res.status} ${res.statusText}`);
  return (await res.json()) as CountryArticles[];
}
