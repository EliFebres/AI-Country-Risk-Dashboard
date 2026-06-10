// app/lib/prices-client.ts
//
// Client-side reader for the bottom-bar "Prices" pane. Unlike the load-once
// /api/dashboard panes, prices are polled on an interval for freshness, so this
// does a plain fetch each call with NO session memo — the route's server-side
// cache (CACHE_TTL.PRICES) is what protects Neon from the polling.
//
// `MarketPrice` mirrors the server-side type in risk-server.ts (kept in sync by
// hand, like NewsAlert/EconCalendarEvent) so this client module never imports
// across the `server-only` boundary.

/** One asset row for the Prices pane. Mirrors risk-server.ts `MarketPrice`. */
export type MarketPrice = {
  symbol: string;
  label: string;
  asset_class: "stocks" | "bonds" | "crypto" | "commodities";
  is_yield: boolean;
  px: number | null;
  chg: number | null;
  q: number | null;
  ytd: number | null;
  sort_order: number;
};

export const PRICES_JSON_PUBLIC_PATH = "/api/prices";

/** Display category order + labels for the Prices table (groups in this order). */
const CATEGORIES: { key: MarketPrice["asset_class"]; label: string }[] = [
  { key: "stocks", label: "Stocks" },
  { key: "bonds", label: "Bonds" },
  { key: "crypto", label: "Crypto" },
  { key: "commodities", label: "Commodities" },
];

export type PriceCategory = {
  key: MarketPrice["asset_class"];
  label: string;
  assets: MarketPrice[];
};

/**
 * Fetch the latest market-price snapshot from /api/prices. Returns the rows in
 * `sort_order`. Throws on a non-OK response so callers can fall back to `[]`.
 */
export async function fetchMarketPrices(signal?: AbortSignal): Promise<MarketPrice[]> {
  const res = await fetch(PRICES_JSON_PUBLIC_PATH, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to load prices: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { marketPrices?: MarketPrice[] };
  return data.marketPrices ?? [];
}

/** Group a flat price list into the ordered display categories (empty ones dropped). */
export function groupByCategory(rows: MarketPrice[]): PriceCategory[] {
  return CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    assets: rows
      .filter((r) => r.asset_class === key)
      .sort((a, b) => a.sort_order - b.sort_order),
  })).filter((cat) => cat.assets.length > 0);
}
