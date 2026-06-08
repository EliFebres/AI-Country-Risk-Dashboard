// app/api/risk/route.ts
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchJoinedLatestRisksFromDB } from "@/app/lib/risk-server";
import { resolveCoords } from "@/app/lib/country-coords";
import { CACHE_TTL } from "@/app/lib/cache-ttl";
import type { CountryRisk } from "@/app/lib/risk-client";

export const runtime = "nodejs";

const getRisks = unstable_cache(
  async (): Promise<CountryRisk[]> => {
    const joined = await fetchJoinedLatestRisksFromDB();
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

export async function GET() {
  try {
    const data = await getRisks();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
