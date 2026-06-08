// app/api/indicators/route.ts
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchLatestIndicatorValuesFromDB } from "@/app/lib/risk-server";
import { CACHE_TTL } from "@/app/lib/cache-ttl";

export const runtime = "nodejs";

const getIndicators = unstable_cache(
  async () => fetchLatestIndicatorValuesFromDB(),
  ["indicators-latest"],
  { revalidate: CACHE_TTL.INDICATORS, tags: ["indicators"] }
);

export async function GET() {
  try {
    const data = await getIndicators();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
