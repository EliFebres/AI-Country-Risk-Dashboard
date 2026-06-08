// app/api/risk-summary/route.ts
import { getSummaries } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

/** Latest non-empty AI bullet summary per country. */
export const GET = jsonRoute(getSummaries);
