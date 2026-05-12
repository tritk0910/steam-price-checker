import { NextResponse } from "next/server";
import axios from "axios";

export const revalidate = 3600;

// Free, no-key exchange-rate API. Returns rates relative to USD; we only
// surface the VND figure.
const EXCHANGE_API = "https://open.er-api.com/v6/latest/USD";

export async function GET() {
  try {
    const { data } = await axios.get(EXCHANGE_API, { timeout: 8_000 });
    const vnd = data?.rates?.VND;
    if (typeof vnd !== "number" || vnd <= 0) {
      throw new Error("Exchange rate API did not return a VND rate.");
    }
    return NextResponse.json(
      { vndPerUsd: Math.round(vnd), updatedAt: data?.time_last_update_utc ?? null },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
