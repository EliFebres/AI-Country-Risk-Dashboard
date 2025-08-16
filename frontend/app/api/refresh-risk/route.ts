// app/api/refresh-risk/route.ts
import { NextResponse } from "next/server";
import { refreshRiskJsonWeekly } from "@/app/lib/risk-server";

// Ensure this runs in Node (needed for fs/pg)
export const runtime = "nodejs";
// Optional: disable caching on dev
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await refreshRiskJsonWeekly();

    // Surface server errors with a 500 so the client sees it
    if (result.status === "error") {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST to /api/refresh-risk to update weekly." });
}
