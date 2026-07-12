import type { Metadata } from "next";

import { Calculator } from "@/components/calculator";
import { formatVnd } from "@/lib/calc";
import { fetchBundlePrice, fetchGamePrice, type GamePriceResult } from "@/lib/steam";

// Keep in sync with components/calculator.tsx defaults.
const DEFAULT_GIFT_RATE = 0.8;
const DEFAULT_VND_PER_USD = 25_500;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Resolve the VND price the app would actually display for this selection.
// Mirrors the `totalVnd` logic in components/calculator.tsx: bundles use the
// bundle price; apps sum the selected packages (`pkg-…`) and DLC (`dlc-…`) from
// the `keys` param, falling back to the first edition / base app price.
async function resolveBaseVnd(
  game: GamePriceResult,
  keysParam: string | undefined,
): Promise<number | null> {
  if (game.kind === "bundle") return game.priceVnd;

  const keys = (keysParam ?? "").split(",").filter(Boolean);
  const pkgIds = keys.filter((k) => k.startsWith("pkg-")).map((k) => Number(k.slice(4)));
  const dlcIds = keys.filter((k) => k.startsWith("dlc-")).map((k) => Number(k.slice(4)));

  let sum = 0;
  let any = false;
  for (const pid of pkgIds) {
    const edition = game.editions.find((e) => e.packageid === pid);
    if (edition?.priceVnd != null) {
      sum += edition.priceVnd;
      any = true;
    }
  }
  // DLC prices live on their own app ids — fetch them (best-effort).
  if (dlcIds.length > 0) {
    const results = await Promise.allSettled(dlcIds.map((d) => fetchGamePrice(d)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.priceVnd != null) {
        sum += r.value.priceVnd;
        any = true;
      }
    }
  }

  if (any) return sum;
  // No usable selection (e.g. link without `keys`) — mirror the app's
  // auto-select of the first edition, else the base app price.
  return game.editions.find((e) => e.priceVnd != null)?.priceVnd ?? game.priceVnd;
}

// Preview text: the gifting-service cost (base price × gift rate) — the
// real-money figure this site exists to surface — then the game description.
function buildDescription(
  game: GamePriceResult,
  giftVnd: number | null,
  vndPerUsd: number,
): string {
  const parts: string[] = [];
  if (game.isFree) {
    parts.push("Free");
  } else if (giftVnd != null) {
    const usd = vndPerUsd > 0 ? giftVnd / vndPerUsd : null;
    parts.push(usd != null ? `${formatVnd(giftVnd)} (~$${usd.toFixed(2)})` : formatVnd(giftVnd));
  }
  if (game.description) parts.push(game.description);
  const text = parts.join(" — ");
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const params = await searchParams;
  const kindRaw = first(params.kind);
  const kind = kindRaw === "bundle" ? "bundle" : kindRaw === "app" ? "app" : null;
  const id = Number(first(params.id));
  if (!kind || !Number.isInteger(id) || id <= 0) return {};

  const giftRateRaw = Number(first(params.gift));
  const giftRate = giftRateRaw > 0 ? giftRateRaw : DEFAULT_GIFT_RATE;
  const vndRaw = Number(first(params.vnd));
  const vndPerUsd = vndRaw > 0 ? vndRaw : DEFAULT_VND_PER_USD;

  try {
    const game = kind === "bundle" ? await fetchBundlePrice(id) : await fetchGamePrice(id);

    const baseVnd = await resolveBaseVnd(game, first(params.keys));
    const giftVnd = baseVnd != null && !game.isFree ? Math.round(baseVnd * giftRate) : null;
    const description = buildDescription(game, giftVnd, vndPerUsd);

    // Use the exact same asset the web "Game info" card renders (Steam
    // header_image) so the shared preview banner matches the site. The 616×353
    // capsule is a different Steam artwork and caused a mismatch.
    const ogImage = game.imageUrl;

    return {
      title: game.name,
      description,
      openGraph: {
        type: "website",
        siteName: "Steam Price Calculator",
        url: `/?kind=${kind}&id=${id}`,
        locale: "en_US",
        title: game.name,
        description,
        images: ogImage ? [{ url: ogImage, width: 460, height: 215, alt: game.name }] : [],
      },
      twitter: {
        card: "summary_large_image",
        title: game.name,
        description,
        images: ogImage ? [ogImage] : [],
      },
    };
  } catch {
    // Never let a preview fetch break the page — fall back to the default
    // site metadata from the root layout.
    return {};
  }
}

export default function Home() {
  return <Calculator />;
}
