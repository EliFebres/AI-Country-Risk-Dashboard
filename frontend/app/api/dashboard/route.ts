// app/api/dashboard/route.ts
//
// Combined sidebar payload. Composes the three already-cached fetchers in
// parallel so the browser pulls indicators + articles + summaries in ONE
// request instead of three. Each fetcher keeps its own per-topic cache TTL
// (24h / 6h / 12h), so SQL is still hit at most once per topic per TTL.
// Risk is intentionally excluded — the map loads it via the lean /api/risk
// route for a fast first paint.
import { NextResponse } from "next/server";
import {
  getIndicators,
  getArticles,
  getSummaries,
} from "@/app/lib/cached-fetchers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [indicators, articles, summaries] = await Promise.all([
      getIndicators(),
      getArticles(),
      getSummaries(),
    ]);
    return NextResponse.json({ indicators, articles, summaries }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
