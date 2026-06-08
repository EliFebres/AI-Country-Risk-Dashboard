// app/api/risk-summary/route.ts
import { NextResponse } from "next/server";
import { getSummaries } from "@/app/lib/cached-fetchers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getSummaries();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
