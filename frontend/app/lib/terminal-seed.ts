// app/lib/terminal-seed.ts
//
// Seed data for the terminal bottom bar.
//
// • ALERTS  — PLACEHOLDER. There is no AI-alerts backend yet; replace this with a
//             feed derived from the risk/summary/articles pipeline when available.
// • ASSETS  — PLACEHOLDER. No live price feed yet; the 1D value is simulated with a
//             random walk client-side. Swap for a real market-data source later.
// • EXCHANGES — production data: open/closed status is computed live from the UTC
//               clock against each exchange's real trading window.
// • CHANNELS  — production data: YouTube channel IDs for the Live TV embeds.

/* ------------------------------- AI Alerts (PLACEHOLDER) ------------------------------- */
export type AlertSeverity = 'critical' | 'caution' | 'watch';
export type AlertImpact = 'up' | 'down' | 'flat';

export type Alert = {
  sev: AlertSeverity;
  cat: 'Sanctions' | 'Conflict' | 'Macro' | 'Politics';
  iso2: string;
  impact: AlertImpact;
  text: string;
};

export const ALERTS: Alert[] = [
  { sev: 'critical', cat: 'Sanctions', iso2: 'RU', impact: 'up', text: 'U.S. bars all new Russian debt & equity — legal investability gate forces risk to 1.00' },
  { sev: 'critical', cat: 'Conflict', iso2: 'PK', impact: 'up', text: 'ISKP exploitation of the Af-Pak border war escalates; cross-border strikes intensify' },
  { sev: 'caution', cat: 'Conflict', iso2: 'IN', impact: 'up', text: 'Analysts warn the next India–Pakistan clash is likely to escalate' },
  { sev: 'caution', cat: 'Macro', iso2: 'AR', impact: 'up', text: 'Inflation at 219.9% keeps macro volatility pinned near the ceiling' },
  { sev: 'caution', cat: 'Macro', iso2: 'TR', impact: 'up', text: 'Inflation 58.5%; central-bank credibility under renewed strain' },
  { sev: 'caution', cat: 'Conflict', iso2: 'SA', impact: 'flat', text: 'Yemen / Strait of Hormuz tensions keep regional conflict risk elevated' },
  { sev: 'watch', cat: 'Politics', iso2: 'VE', impact: 'flat', text: 'Caracas reaffirms Essequibo claim; Guyana border friction persists' },
  { sev: 'watch', cat: 'Sanctions', iso2: 'CN', impact: 'flat', text: 'Beijing defies U.S. sanctions; banks caught in compliance crossfire' },
  { sev: 'watch', cat: 'Politics', iso2: 'NG', impact: 'down', text: 'Coup-plot treason trial proceeds, but rising oil revenue offers fiscal relief' },
  { sev: 'watch', cat: 'Macro', iso2: 'US', impact: 'flat', text: 'Fed split on policy as Iran oil shock clouds the inflation path' },
];

export const SEV_LABEL: Record<AlertSeverity, string> = {
  critical: 'Critical',
  caution: 'Caution',
  watch: 'Watch',
};

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
    { sym: 'Nasdaq', px: 17862.3, chg: 0.71, q: 6.1, ytd: 14.6 },
    { sym: 'Dow Jones', px: 39145.0, chg: -0.18, q: 2.3, ytd: 5.4 },
    { sym: 'FTSE 100', px: 8214.5, chg: 0.23, q: 3.1, ytd: 6.8 },
    { sym: 'DAX', px: 18412.0, chg: 0.55, q: 5.0, ytd: 9.7 },
    { sym: 'Nikkei 225', px: 38703.5, chg: -0.34, q: 7.2, ytd: 15.3 },
    { sym: 'Hang Seng', px: 18021.2, chg: 1.12, q: -2.1, ytd: -4.5 },
    { sym: 'STOXX 50', px: 4985.7, chg: 0.31, q: 4.2, ytd: 8.9 },
  ],
  bonds: [
    { sym: 'US 10Y', px: 4.28, chg: -0.03, q: 0.18, ytd: 0.41, y: 1 },
    { sym: 'US 2Y', px: 4.71, chg: 0.02, q: -0.05, ytd: 0.22, y: 1 },
    { sym: 'US 30Y', px: 4.45, chg: -0.02, q: 0.21, ytd: 0.38, y: 1 },
    { sym: 'Bund 10Y', px: 2.51, chg: 0.01, q: 0.12, ytd: 0.29, y: 1 },
    { sym: 'Gilt 10Y', px: 4.12, chg: -0.04, q: 0.15, ytd: 0.33, y: 1 },
    { sym: 'JGB 10Y', px: 1.07, chg: 0.0, q: 0.09, ytd: 0.34, y: 1 },
    { sym: 'OAT 10Y', px: 3.18, chg: 0.02, q: 0.14, ytd: 0.31, y: 1 },
  ],
  crypto: [
    { sym: 'BTC', px: 67432, chg: 2.14, q: 12.5, ytd: 48.2 },
    { sym: 'ETH', px: 3287.5, chg: 1.42, q: 8.1, ytd: 31.7 },
    { sym: 'SOL', px: 172.3, chg: 3.55, q: 22.3, ytd: 86.4 },
    { sym: 'XRP', px: 0.532, chg: -0.88, q: -5.2, ytd: -12.1 },
    { sym: 'BNB', px: 603.1, chg: 0.66, q: 9.4, ytd: 24.8 },
    { sym: 'DOGE', px: 0.1487, chg: -1.21, q: -8.7, ytd: 19.5 },
    { sym: 'ADA', px: 0.451, chg: 0.34, q: -3.1, ytd: -7.8 },
  ],
  commodities: [
    { sym: 'Gold', px: 2358.4, chg: 0.38, q: 6.4, ytd: 14.1 },
    { sym: 'Silver', px: 30.72, chg: 0.91, q: 8.9, ytd: 19.6 },
    { sym: 'WTI Crude', px: 81.45, chg: -1.12, q: -4.5, ytd: 3.2 },
    { sym: 'Brent', px: 85.3, chg: -0.95, q: -3.8, ytd: 2.7 },
    { sym: 'Nat Gas', px: 2.71, chg: 2.4, q: -11.2, ytd: -18.4 },
    { sym: 'Copper', px: 4.62, chg: 0.54, q: 7.1, ytd: 12.8 },
    { sym: 'Wheat', px: 621.5, chg: -0.42, q: -6.3, ytd: -9.1 },
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
