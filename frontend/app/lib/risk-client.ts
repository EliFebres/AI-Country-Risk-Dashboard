// app/lib/risk-client.ts

export type CountryRisk = {
  name: string;
  lngLat: [number, number]; // [lng, lat]
  risk: number;             // 0..1
};

export const RISK_JSON_PUBLIC_PATH = "/api/risk.json";

/** Load risks in the browser (Client Components / useEffect). */
export async function loadRisksClient(signal?: AbortSignal): Promise<CountryRisk[]> {
  const res = await fetch(RISK_JSON_PUBLIC_PATH, { cache: "force-cache", signal });
  if (!res.ok) throw new Error(`Failed to load risks: ${res.status} ${res.statusText}`);
  return (await res.json()) as CountryRisk[];
}

/** Optional helper */
export function getRiskByCountry(data: CountryRisk[], name: string): CountryRisk | undefined {
  const key = name.trim().toLowerCase();
  return data.find(d => d.name.trim().toLowerCase() === key);
}
