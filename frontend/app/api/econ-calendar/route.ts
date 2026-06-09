// app/api/econ-calendar/route.ts
import { getEconCalendar } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

/** Up to 12 upcoming (next 7 days) economic-calendar events, closest first. */
export const GET = jsonRoute(getEconCalendar);
