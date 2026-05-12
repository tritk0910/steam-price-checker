import { NextResponse } from "next/server";

import { searchSteam } from "@/lib/steam";

export const revalidate = 0;

export async function GET(req: Request) {
  const term = new URL(req.url).searchParams.get("q") ?? "";
  if (!term.trim()) return NextResponse.json({ results: [] });
  try {
    const results = await searchSteam(term);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
