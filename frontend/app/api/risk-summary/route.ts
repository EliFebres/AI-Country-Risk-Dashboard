// app/api/risk-summary/route.ts
import { NextResponse } from 'next/server';
import { writeRiskSummaryJson } from '@/app/lib/risk-server';

// IMPORTANT: ensure we run on the Node.js runtime so fs works.
export const runtime = 'nodejs';
// Optional but helpful to avoid any caching weirdness during dev.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { iso2, name } = await req.json();
    if (!iso2 && !name) {
      return NextResponse.json({ error: 'iso2 or name required' }, { status: 400 });
    }

    const out = await writeRiskSummaryJson({ iso2, name });
    if (!out) {
      return NextResponse.json({ error: 'No summary found (check bullet_summary not null)' }, { status: 404 });
    }
    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    // Bubble the error so you can see it in the browser Network tab
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
