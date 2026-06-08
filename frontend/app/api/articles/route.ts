// app/api/articles/route.ts
import { getArticles } from "@/app/lib/cached-fetchers";
import { jsonRoute } from "@/app/lib/api";

export const runtime = "nodejs";

/** Top-3 articles per country's latest snapshot. */
export const GET = jsonRoute(getArticles);
