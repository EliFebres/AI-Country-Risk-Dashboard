// app/lib/terminal-seed.ts
//
// Seed data for the terminal bottom bar.
//
// • ASSETS  — PLACEHOLDER. No live price feed yet; the 1D value is simulated with a
//             random walk client-side. Swap for a real market-data source later.
// • EXCHANGES — production data: open/closed status is computed live from the UTC
//               clock against each exchange's real trading window.
// • CHANNELS  — production data: YouTube channel IDs for the Live TV embeds.

/* ------------------------------- AI Alerts ------------------------------- */
// Now backed by the live news-alert feed — see app/components/bottombar/
// AIAlerts.tsx (reads the /api/dashboard `newsAlerts` slice). No seed here.

/* ------------------------------- Econ Calendar ------------------------------- */
// Now backed by the live economic-calendar feed — see app/components/bottombar/
// EconCalendar.tsx (reads the /api/dashboard `econCalendar` slice). No seed here.

/* ------------------------------- Prices (PLACEHOLDER) ------------------------------- */
export type Asset = {
  sym: string;
  px: number;
  chg: number; // 1D
  q: number; // 1Q
  ytd: number;
  y?: 1; // yield instrument (bonds): show '%' and point changes
  open?: number; // seeded opening price for live change calc
};

export type AssetCategoryKey = 'stocks' | 'bonds' | 'crypto' | 'commodities';

export const ASSETS: Record<AssetCategoryKey, Asset[]> = {
  stocks: [
    { sym: 'S&P 500', px: 5487.2, chg: 0.42, q: 4.8, ytd: 11.2 },
    { sym: 'Russell 3000', px: 3052.6, chg: 0.38, q: 4.1, ytd: 9.8 },
    { sym: 'MSCI World ex USA', px: 2451.3, chg: 0.27, q: 3.4, ytd: 7.5 },
    { sym: 'MSCI Emerging Markets', px: 1082.7, chg: 0.61, q: 2.2, ytd: 5.1 },
    { sym: 'MSCI All Country World', px: 812.4, chg: 0.35, q: 3.9, ytd: 9.2 },
  ],
  bonds: [
    { sym: 'US 2Y', px: 4.71, chg: 0.02, q: -0.05, ytd: 0.22, y: 1 },
    { sym: 'US 10Y', px: 4.28, chg: -0.03, q: 0.18, ytd: 0.41, y: 1 },
    { sym: 'US 30Y', px: 4.45, chg: -0.02, q: 0.21, ytd: 0.38, y: 1 },
    { sym: 'DE 10Y (Bund)', px: 2.51, chg: 0.01, q: 0.12, ytd: 0.29, y: 1 },
    { sym: 'JP 10Y (JGB)', px: 1.07, chg: 0.0, q: 0.09, ytd: 0.34, y: 1 },
    { sym: 'CN 10Y (CGB)', px: 2.3, chg: -0.01, q: -0.08, ytd: -0.26, y: 1 },
  ],
  crypto: [
    { sym: 'BTC', px: 67432, chg: 2.14, q: 12.5, ytd: 48.2 },
    { sym: 'ETH', px: 3287.5, chg: 1.42, q: 8.1, ytd: 31.7 },
    { sym: 'SOL', px: 172.3, chg: 3.55, q: 22.3, ytd: 86.4 },
    { sym: 'XRP', px: 0.532, chg: -0.88, q: -5.2, ytd: -12.1 },
  ],
  commodities: [
    { sym: 'Gold', px: 2358.4, chg: 0.38, q: 6.4, ytd: 14.1 },
    { sym: 'Silver', px: 30.72, chg: 0.91, q: 8.9, ytd: 19.6 },
    { sym: 'WTI Crude Oil', px: 81.45, chg: -1.12, q: -4.5, ytd: 3.2 },
    { sym: 'Brent Crude Oil', px: 85.3, chg: -0.95, q: -3.8, ytd: 2.7 },
    { sym: 'Natural Gas', px: 2.71, chg: 2.4, q: -11.2, ytd: -18.4 },
    { sym: 'Wheat', px: 621.5, chg: -0.42, q: -6.3, ytd: -9.1 },
    { sym: 'Corn', px: 445.2, chg: 0.31, q: -4.8, ytd: -7.2 },
  ],
};

export const TRK_CATS: [AssetCategoryKey, string][] = [
  ['stocks', 'Stocks'],
  ['bonds', 'Bonds'],
  ['crypto', 'Crypto'],
  ['commodities', 'Commodities'],
];

/* ------------------------------- World Markets (live logic) ------------------------------- */
// Trading windows in UTC decimal hours (DST approximated for the current season);
// `days` are the UTC weekdays the exchange trades. `vol` = avg daily $ volume (B).
export type Exchange = {
  code: string;
  iso2: string;
  off: number; // UTC offset hours (for any local-time display)
  o: number; // open (UTC decimal hours)
  c: number; // close (UTC decimal hours)
  days: number[]; // UTC weekdays (0=Sun)
  vol: number; // avg daily $ volume in billions
};

export const EXCHANGES: Exchange[] = [
  { code: 'TSE', iso2: 'JP', off: 9, o: 0, c: 6, days: [1, 2, 3, 4, 5], vol: 28 },
  { code: 'ASX', iso2: 'AU', off: 10, o: 0, c: 6, days: [1, 2, 3, 4, 5], vol: 5 },
  { code: 'SSE', iso2: 'CN', off: 8, o: 1.5, c: 7, days: [1, 2, 3, 4, 5], vol: 85 },
  { code: 'SGX', iso2: 'SG', off: 8, o: 1, c: 9, days: [1, 2, 3, 4, 5], vol: 1 },
  { code: 'NSE', iso2: 'IN', off: 5.5, o: 3.75, c: 10, days: [1, 2, 3, 4, 5], vol: 11 },
  { code: 'TASI', iso2: 'SA', off: 3, o: 7, c: 12, days: [0, 1, 2, 3, 4], vol: 2.5 },
  { code: 'JSE', iso2: 'ZA', off: 2, o: 7, c: 15, days: [1, 2, 3, 4, 5], vol: 2 },
  { code: 'FRA', iso2: 'DE', off: 2, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 7 },
  { code: 'PAR', iso2: 'FR', off: 2, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 10 },
  { code: 'LSE', iso2: 'GB', off: 1, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 11 },
  { code: 'B3', iso2: 'BR', off: -3, o: 13, c: 20, days: [1, 2, 3, 4, 5], vol: 4.5 },
  { code: 'NYSE', iso2: 'US', off: -4, o: 13.5, c: 20, days: [1, 2, 3, 4, 5], vol: 95 },
  { code: 'TSX', iso2: 'CA', off: -4, o: 13.5, c: 20, days: [1, 2, 3, 4, 5], vol: 8 },
].sort((a, b) => b.vol - a.vol);

/* ------------------------------- Live TV channels ------------------------------- */
export type Channel = { key: string; label: string; id: string };

export const CHANNELS: Channel[] = [
  { key: 'bloomberg', label: 'Bloomberg', id: 'UCIALMKvObZNtJ6AmdCLP7Lg' },
  { key: 'euronews', label: 'Euronews', id: 'UCSrZ3UV4jOidv8ppoVuvW9Q' },
  { key: 'dw', label: 'DW News', id: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { key: 'aljazeera', label: 'Al Jazeera', id: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { key: 'cna', label: 'CNA', id: 'UC83jt4dlz1Gjl58fzQrrKZg' },
];
