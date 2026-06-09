# AI Country Risk Dashboard — Frontend

A Next.js (App Router) terminal-style dashboard for country risk. It renders a MapLibre world map with per-country risk markers, a slide-in detail sidebar (risk reading + trend chart, economic gauges, AI summary, news), a global "World Risk Index" rail, a masthead status bar, and a bottom ticker bar.

All data comes from a Neon Postgres database, served through cached API routes that query the DB directly. There is **no** filesystem JSON file and **no** weekly refresh job — the previous `public/api/risk.json` / `POST /api/refresh-risk` flow has been removed.

## Tech Stack

- **Next.js 15** (App Router, server components) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** plus CSS design tokens in `app/globals.css` (`--amber-border`, `--risk-high/elev/low`, etc.)
- **MapLibre GL 5** with OpenFreeMap dark tiles for the map
- **Recharts 3** for the shared `RiskTrendChart` area chart
- **pg 8** connecting to **Neon Postgres** for all data

## Requirements

- Node 18+ and npm
- A Neon Postgres database
- Env var: `DATABASE_URL` (must include SSL, e.g. with `sslmode=require`)

## Quick Start

1. From the repo root: `cd frontend`
2. Install deps: `npm i`
3. Create `.env` with:
   ```
   DATABASE_URL=postgres://USER:PASSWORD@HOST/DB?sslmode=require
   ```
4. Run the dev server: `npm run dev`
5. Open http://localhost:3000 — the map loads risk markers from `/api/risk`; clicking a country opens the sidebar, which loads its details from `/api/dashboard`.

## Commands

- `npm run dev` — Start Next.js in development (Turbopack)
- `npm run build` — Production build
- `npm run start` — Run the production build
- `npm run lint` — Lint

## Architecture

A single route (`app/page.tsx`) renders `TerminalDashboard`, the client orchestrator that owns selection state and lays out the panels:

- **Map** (`app/components/Map.tsx`, via `MapClient.tsx`) — MapLibre map with SVG ring markers per country; loads `/api/risk` on mount.
- **RiskSidebar** (`app/components/RiskSidebar.tsx`) — slide-in detail panel with Risk Reading + trend chart, Economic Gauges, AI Summary, and News sections; loads `/api/dashboard`.
- **WorldRiskIndexRail** (`app/components/WorldRiskIndexRail.tsx`) — always-visible rail showing the global average, risk distribution, and top movers.
- **Masthead** (`app/components/Masthead.tsx`) — top status bar (coverage count, live clock, idle-tour toggle).
- **BottomBar** (`app/components/bottombar/`) — ticker bar with Live TV, markets, prices, econ calendar, and AI alerts.

`RiskTrendChart` (`app/components/RiskTrendChart.tsx`) is a shared Recharts area chart used by both the sidebar's Risk Reading section and the rail.

## Data & API Routes

All routes run on the Node.js runtime, respond to `GET`, and are wrapped by `jsonRoute` (`app/lib/api.ts`). They share the same `unstable_cache`-wrapped fetchers in `app/lib/cached-fetchers.ts`.

| Route | Returns | Used by |
| --- | --- | --- |
| `/api/risk` | Latest risk score + history per country, with resolved map coordinates | Map (fast first paint) |
| `/api/dashboard` | Indicators + articles + summaries composed in parallel (one request) | Sidebar |
| `/api/indicators` | Latest year/value for the four target indicators per country | (individual topic) |
| `/api/articles` | Top-3 articles per country's latest snapshot | (individual topic) |
| `/api/risk-summary` | Latest AI bullet summary per country | (individual topic) |

On the client, `RISK_CACHE` (`app/lib/risk-client.ts`) and `DASHBOARD_CACHE` (`app/lib/dashboard-client.ts`) dedupe these fetches across components.

## Caching

Each topic is a single `unstable_cache` instance shared by every route that needs it, so Neon is queried at most once per TTL per topic. TTLs live in `app/lib/cache-ttl.ts`:

- **Risk** — 12h
- **Risk summaries** — 12h
- **Indicators** — 24h
- **Articles** — 6h

This is an in-memory/CDN cache — nothing is written to the filesystem.

## Database

Queries live in `app/lib/risk-server.ts` (`server-only`), which uses a process-wide pooled `pg` connection created from `DATABASE_URL`. The schema is expected to provide these tables:

- `country` — ISO2 code + name
- `risk_snapshot` — per-country risk scores over time (and `bullet_summary`)
- `risk_snapshot_article` — news articles tied to a snapshot
- `indicator` / `yearly_value` — World Bank indicator definitions and values

Map positions are resolved from the static lookup in `app/lib/country-coords.ts` (by ISO2/name). Countries with no known position are skipped on the map.

## Placeholder / Seed Features

Some bottom-bar panes — Prices, World Markets, Econ Calendar, AI Alerts, and Live TV — currently render seed or simulated data and have no backend yet. They are wired into the UI but not connected to the database.
