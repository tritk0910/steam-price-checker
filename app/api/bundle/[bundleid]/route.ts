import { NextResponse } from "next/server";

import { fetchBundlePrice } from "@/lib/steam";

export const revalidate = 300;

export async function GET(_req: Request, ctx: RouteContext<"/api/bundle/[bundleid]">) {
  const { bundleid } = await ctx.params;
  const id = Number(bundleid);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid bundle id." }, { status: 400 });
  }

  try {
    const data = await fetchBundlePrice(id);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
