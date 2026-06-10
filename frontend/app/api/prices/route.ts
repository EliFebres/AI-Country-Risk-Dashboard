// app/api/prices/route.ts
//
// Dedicated, lightweight feed for the bottom-bar "Prices" pane. Kept OUT of the
// load-once /api/dashboard payload so the pane can poll it on its own ~5-minute
// cadence (matching the prices daemon's write cadence) without re-pulling the
// heavier combined payload. The fetcher's per-topic cache TTL still ensures Neon
// is hit at most once per PRICES window no matter how many clients poll.
import { getMarketPrices } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const marketPrices = await getMarketPrices();
  return { marketPrices };
});
