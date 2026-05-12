import { NextResponse } from "next/server";

import { fetchTf2KeyPrice } from "@/lib/steam";

export const revalidate = 120;

export async function GET() {
  try {
    const data = await fetchTf2KeyPrice();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
