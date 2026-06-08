// app/lib/api.ts
import { NextResponse } from "next/server";

/**
 * Build a `GET` route handler that serializes a fetcher's result as JSON.
 *
 * Centralizes the identical try/catch the DB-backed routes used to repeat:
 * success → `200` with the payload, thrown error → `500` with
 * `{ error: <message> }` (message resolved exactly as before, no `any`).
 *
 * @typeParam T - The fetcher's resolved payload type.
 * @param fetcher - Async producer of the response body.
 * @returns A Next.js route handler suitable for `export const GET = ...`.
 */
export function jsonRoute<T>(fetcher: () => Promise<T>): () => Promise<NextResponse> {
  return async () => {
    try {
      const data = await fetcher();
      return NextResponse.json(data, { status: 200 });
    } catch (err) {
      const e = err as { message?: unknown } | null | undefined;
      return NextResponse.json({ error: String(e?.message ?? err) }, { status: 500 });
    }
  };
}
