// app/api/risk/route.ts
import { getRisks } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

/** Latest risk score + history per country, with resolved map coordinates. */
export const GET = jsonRoute(getRisks);
