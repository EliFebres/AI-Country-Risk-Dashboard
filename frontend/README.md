# AI Country Risk Dashboard — Frontend

A Next.js (App Router) frontend that renders a world map with country risk markers. Risk values are read from `public/api/risk.json`. A server-only job updates those values from Neon Postgres at most once per week and records the last run in `public/api/risk._meta.json`.

## Requirements

- Node 18+ and npm
- A Neon Postgres database
- Env var: `DATABASE_URL` (must include SSL, e.g. with `sslmode=require`)

## Quick Start

1. From the repo root: `cd frontend`
2. Install deps: `npm i`
3. Create `.env.local` with: DATABASE_URL=postgres://USER:PASSWORD@HOST/DB?sslmode=require
4. Ensure `public/api/risk.json` exists (seeded with `{ name, lngLat, risk }` entries).
5. Run dev server: `npm run dev`

On first map load, the app calls `POST /api/refresh-risk`. The server updates `public/api/risk.json` only if the previous run was more than 7 days ago, then writes the timestamp to `public/api/risk._meta.json`. The client then fetches `risk.json` with cache-busting to ensure fresh values.

## Commands

- `npm run dev` — Start Next.js in development
- `npm run build` — Build
- `npm run start` — Run the production build
- (optional) `npx ts-node scripts/refresh-risk.ts` — Trigger the weekly refresh logic from the CLI

## How Risk Updates Work (summary)

- **Client** (`app/components/Map.tsx`):
- On map `load`, it `POST`s to `/api/refresh-risk` (server decides to **skip** or **update**).
- Then it fetches `public/api/risk.json` with `cache: 'no-store'` and a `?v=<last_run>` query to avoid stale cache.
- It renders markers using `{ name, lngLat, risk }` and opens the sidebar on click.

- **Server** (`app/api/refresh-risk/route.ts` → `app/lib/risk-server.ts`):
- Reads `public/api/risk._meta.json`. If last run < 7 days ago → **skip**.
- If eligible, queries Neon for the latest per-country risk (via `pg`).
- Updates only the `risk` field for names that match entries in `risk.json` (keeps coordinates and names intact).
- Writes `public/api/risk._meta.json` with `last_run`.

## Manual Refresh

You can trigger an update anytime (server will still skip if not eligible):
curl -X POST http://localhost:3000/api/refresh-risk

## Caching Notes

Immediately after a refresh, the client fetches `risk.json` with `cache: 'no-store'` and a cache-busting query so markers reflect the newest scores. Regular navigation thereafter can rely on normal browser caching.

## Deployment Notes

The updater writes to `public/api/*` on the local filesystem. This works on long-lived Node servers. For serverless or read-only filesystems, store the generated JSON in external storage and read from there in the client.
