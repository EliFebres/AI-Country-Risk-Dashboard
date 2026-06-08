// app/lib/cache-ttl.ts
//
// Per-topic cache lifetimes (in seconds) for the DB-backed API routes. Each TTL
// is chosen to match how often the underlying data is inserted, so we serve from
// an in-memory/CDN cache between inserts instead of hitting Neon on every request.
// (This is NOT a disk cache — nothing is written to the filesystem.)
//
// Tune a single number here when a topic's ingestion cadence changes.

const HOUR = 60 * 60;

export const CACHE_TTL = {
  // Country risk scores + summaries are recomputed by the weekly ETL (Mondays),
  // so a 12h window picks up a fresh run within hours while staying cheap.
  RISK: 12 * HOUR,
  RISK_SUMMARY: 12 * HOUR,

  // World Bank indicators are annual values refreshed by the same weekly run;
  // a day is plenty fresh.
  INDICATORS: 24 * HOUR,

  // News articles are tied to the latest snapshot today but conceptually update
  // more often; keep this shorter.
  ARTICLES: 6 * HOUR,

  // ---- Placeholders for future feeds (seed data today, no backend yet) ----
  ECON_CALENDAR: 12 * HOUR, // weekly releases
  AI_ALERTS: 1 * HOUR,      // daily generation
  PRICES: 5 * 60,           // intra-day / daily market data
} as const;
