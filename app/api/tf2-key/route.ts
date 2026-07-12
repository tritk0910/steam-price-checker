import { NextResponse } from "next/server";

import { fetchTf2KeyPrice, type KeyPriceResult } from "@/lib/steam";

export const revalidate = 120;

// Steam's market priceoverview endpoint is aggressively rate-limited per IP and
// returns 429 when polled too often (React Query refetches on mount + every
// stale window). Keep the last good price in-memory: serve it within the TTL to
// throttle upstream calls, and fall back to it when Steam throttles us so the
// UI keeps a sensible value instead of erroring out.
const TTL_MS = 120_000;
let cache: { data: KeyPriceResult; at: number } | null = null;

export async function GET() {
  const now = Date.now();
  const headers = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" };

  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, { headers });
  }

  try {
    const data = await fetchTf2KeyPrice();
    cache = { data, at: now };
    return NextResponse.json(data, { headers });
  } catch (err) {
    // Steam threw (usually 429). Serve the last good price if we have one.
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "public, s-maxage=30" },
      });
    }
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
