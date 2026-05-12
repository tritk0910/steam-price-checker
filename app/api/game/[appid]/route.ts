import { NextResponse } from "next/server";

import { fetchGamePrice } from "@/lib/steam";

export const revalidate = 300;

export async function GET(_req: Request, ctx: RouteContext<"/api/game/[appid]">) {
  const { appid } = await ctx.params;
  const id = Number(appid);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid app id." }, { status: 400 });
  }

  try {
    const data = await fetchGamePrice(id);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
