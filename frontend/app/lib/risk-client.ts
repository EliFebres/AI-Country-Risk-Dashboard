export type CountryRisk = {
  name: string;
  lngLat: [number, number]; // [lng, lat]
  risk: number;             // 0..1 (current risk)
  prevRisk?: number;        // previous single value (convenience)
  prevRiskSeries?: number[]; // NEW: all prior scores, newest→oldest (excludes current)
  iso2?: string;            // populated by weekly refresh
};

export const RISK_JSON_PUBLIC_PATH = "/api/risk.json";

/** Load risks in the browser (Client Components / useEffect). */
export async function loadRisksClient(signal?: AbortSignal): Promise<CountryRisk[]> {
  const res = await fetch(RISK_JSON_PUBLIC_PATH, { cache: "force-cache", signal });
  if (!res.ok) throw new Error(`Failed to load risks: ${res.status} ${res.statusText}`);
  return (await res.json()) as CountryRisk[];
}

/**
 * Find a country in loaded data AND trigger a server-side write of
 * public/api/risk_summary.json with { country_iso2, bullet_summary }.
 * NOTE: now async — await it where used.
 */
export async function getRiskByCountry(
  data: CountryRisk[],
  name: string
): Promise<CountryRisk | undefined> {
  const key = name.trim().toLowerCase();
  const found = data.find(d => d.name.trim().toLowerCase() === key);

  if (found) {
    // Fire-and-forget; ignore errors on the client
    try {
      await fetch("/api/risk-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iso2: found.iso2, name: found.name }),
        cache: "no-store",
      });
    } catch {
      /* no-op */
    }
  }
  return found;
}
