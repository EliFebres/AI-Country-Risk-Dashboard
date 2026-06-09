// app/api/dashboard/route.ts
//
// Combined sidebar payload. Composes the three already-cached fetchers in
// parallel so the browser pulls indicators + articles + summaries in ONE
// request instead of three. Each fetcher keeps its own per-topic cache TTL
// (24h / 6h / 12h), so SQL is still hit at most once per topic per TTL.
// Risk is intentionally excluded — the map loads it via the lean /api/risk
// route for a fast first paint.
import { getIndicators, getArticles, getSummaries, getEconCalendar } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const [indicators, articles, summaries, econCalendar] = await Promise.all([
    getIndicators(),
    getArticles(),
    getSummaries(),
    getEconCalendar(),
  ]);
  return { indicators, articles, summaries, econCalendar };
});
