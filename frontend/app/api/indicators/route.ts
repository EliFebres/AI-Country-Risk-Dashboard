// app/api/indicators/route.ts
import { getIndicators } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

/** Latest year/value for the four target indicators, per country. */
export const GET = jsonRoute(getIndicators);
