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
  name: string; // full exchange name (hover tooltip)
  country: string; // country the exchange is in (hover tooltip)
  iso2: string;
  off: number; // UTC offset hours (for any local-time display)
  o: number; // open (UTC decimal hours)
  c: number; // close (UTC decimal hours)
  days: number[]; // UTC weekdays (0=Sun)
  vol: number; // avg daily $ volume in billions
};

export const EXCHANGES: Exchange[] = [
  { code: 'TSE', name: 'Tokyo Stock Exchange', country: 'Japan', iso2: 'JP', off: 9, o: 0, c: 6, days: [1, 2, 3, 4, 5], vol: 28 },
  { code: 'ASX', name: 'Australian Securities Exchange', country: 'Australia', iso2: 'AU', off: 10, o: 0, c: 6, days: [1, 2, 3, 4, 5], vol: 5 },
  { code: 'SSE', name: 'Shanghai Stock Exchange', country: 'China', iso2: 'CN', off: 8, o: 1.5, c: 7, days: [1, 2, 3, 4, 5], vol: 85 },
  { code: 'SGX', name: 'Singapore Exchange', country: 'Singapore', iso2: 'SG', off: 8, o: 1, c: 9, days: [1, 2, 3, 4, 5], vol: 1 },
  { code: 'NSE', name: 'National Stock Exchange of India', country: 'India', iso2: 'IN', off: 5.5, o: 3.75, c: 10, days: [1, 2, 3, 4, 5], vol: 11 },
  { code: 'TASI', name: 'Saudi Exchange (Tadawul)', country: 'Saudi Arabia', iso2: 'SA', off: 3, o: 7, c: 12, days: [0, 1, 2, 3, 4], vol: 2.5 },
  { code: 'JSE', name: 'Johannesburg Stock Exchange', country: 'South Africa', iso2: 'ZA', off: 2, o: 7, c: 15, days: [1, 2, 3, 4, 5], vol: 2 },
  { code: 'FRA', name: 'Frankfurt Stock Exchange', country: 'Germany', iso2: 'DE', off: 2, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 7 },
  { code: 'PAR', name: 'Euronext Paris', country: 'France', iso2: 'FR', off: 2, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 10 },
  { code: 'LSE', name: 'London Stock Exchange', country: 'United Kingdom', iso2: 'GB', off: 1, o: 7, c: 15.5, days: [1, 2, 3, 4, 5], vol: 11 },
  { code: 'B3', name: 'B3 (Brasil Bolsa Balcão)', country: 'Brazil', iso2: 'BR', off: -3, o: 13, c: 20, days: [1, 2, 3, 4, 5], vol: 4.5 },
  { code: 'NYSE', name: 'New York Stock Exchange', country: 'United States', iso2: 'US', off: -4, o: 13.5, c: 20, days: [1, 2, 3, 4, 5], vol: 95 },
  { code: 'TSX', name: 'Toronto Stock Exchange', country: 'Canada', iso2: 'CA', off: -4, o: 13.5, c: 20, days: [1, 2, 3, 4, 5], vol: 8 },
].sort((a, b) => b.vol - a.vol);

/* ------------------------------- Live TV channels ------------------------------- */
// Fallback/initial list for the Live TV pane. The live source of truth is the
// `live_tv_channel` DB table (served via /api/dashboard `channels`), so a dead
// stream can be re-pointed by SQL with no deploy; this seed is only used for the
// first render and if the DB read fails. Keep it in sync as a sane default.
export type Channel = { key: string; label: string; id: string };

export const CHANNELS: Channel[] = [
  // Bloomberg Originals — Bloomberg Television's free 24/7 stream moved to paid
  // Bloomberg TV+ on YouTube TV (Oct 2025), so the embed points at Originals.
  { key: 'bloomberg', label: 'Bloomberg', id: 'UCUMZ7gohGI9HcU9VNsr2FJQ' },
  { key: 'euronews', label: 'Euronews', id: 'UCSrZ3UV4jOidv8ppoVuvW9Q' },
  { key: 'dw', label: 'DW News', id: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { key: 'aljazeera', label: 'Al Jazeera', id: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { key: 'cna', label: 'CNA', id: 'UC83jt4dlz1Gjl58fzQrrKZg' },
];
