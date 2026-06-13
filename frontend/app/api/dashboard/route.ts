// app/api/dashboard/route.ts
//
// Combined sidebar payload. Composes the three already-cached fetchers in
// parallel so the browser pulls indicators + articles + summaries in ONE
// request instead of three. Each fetcher keeps its own per-topic cache TTL
// (24h / 6h / 12h), so SQL is still hit at most once per topic per TTL.
// Risk is intentionally excluded — the map loads it via the lean /api/risk
// route for a fast first paint.
import { getIndicators, getIndicatorAverages, getArticles, getSummaries, getEconCalendar, getNewsAlerts, getChannels } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

const handler = jsonRoute(async () => {
  const [indicators, indicatorAverages, articles, summaries, econCalendar, newsAlerts, channels] = await Promise.all([
    getIndicators(),
    getIndicatorAverages(),
    getArticles(),
    getSummaries(),
    getEconCalendar(),
    getNewsAlerts(),
    getChannels(),
  ]);
  return { indicators, indicatorAverages, articles, summaries, econCalendar, newsAlerts, channels };
});

// `no-store`: this combined payload's SHAPE evolves as slices are added (it has
// grown indicatorAverages, econCalendar, newsAlerts over time). A browser that
// cached an older shape must never keep serving it, or new slices silently read
// as missing. SQL is still memoized server-side via the cached fetchers' TTLs.
export const GET = async () => {
  const res = await handler();
  res.headers.set("Cache-Control", "no-store");
  return res;
};
