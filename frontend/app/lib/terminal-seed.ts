// app/lib/terminal-seed.ts
//
// Seed data for the terminal bottom bar.
//
// • EXCHANGES — production data: open/closed status is computed live from the UTC
//               clock against each exchange's real trading window.
// • CHANNELS  — production data: YouTube channel IDs for the Live TV embeds.

/* ------------------------------- AI Alerts ------------------------------- */
// Now backed by the live news-alert feed — see app/components/bottombar/
// AIAlerts.tsx (reads the /api/dashboard `newsAlerts` slice). No seed here.

/* ------------------------------- Econ Calendar ------------------------------- */
// Now backed by the live economic-calendar feed — see app/components/bottombar/
// EconCalendar.tsx (reads the /api/dashboard `econCalendar` slice). No seed here.

/* ------------------------------- Prices ------------------------------- */
// Now backed by the live market_price feed — see app/components/bottombar/
// Prices.tsx (polls the /api/prices route). No seed here.

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
