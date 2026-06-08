// app/api/articles/route.ts
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchLatestArticlesForLatestSnapshotsFromDB } from "@/app/lib/risk-server";
import { CACHE_TTL } from "@/app/lib/cache-ttl";

export const runtime = "nodejs";

const getArticles = unstable_cache(
  async () => fetchLatestArticlesForLatestSnapshotsFromDB(),
  ["articles-latest"],
  { revalidate: CACHE_TTL.ARTICLES, tags: ["articles"] }
);

export async function GET() {
  try {
    const data = await getArticles();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
