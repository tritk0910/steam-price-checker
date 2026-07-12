import type { Metadata } from "next";

import { Calculator } from "@/components/calculator";
import { fetchBundlePrice, fetchGamePrice, type GamePriceResult } from "@/lib/steam";

// Compose the preview text: price first (VND, plus USD when known), then the
// game's short description — mirrors how Steam's own store embeds read.
function buildDescription(game: GamePriceResult): string {
  const parts: string[] = [];
  const price = game.isFree
    ? "Free"
    : (game.formatted ??
      (game.priceUsd != null ? `$${game.priceUsd.toFixed(2)}` : null));
  if (price && game.priceUsd != null && !game.isFree && game.formatted) {
    parts.push(`${price} (~$${game.priceUsd.toFixed(2)})`);
  } else if (price) {
    parts.push(price);
  }
  if (game.description) parts.push(game.description);
  const text = parts.join(" — ");
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/">): Promise<Metadata> {
  const params = await searchParams;
  const kindRaw = params.kind;
  const kind = kindRaw === "bundle" ? "bundle" : kindRaw === "app" ? "app" : null;
  const idRaw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = Number(idRaw);
  if (!kind || !Number.isInteger(id) || id <= 0) return {};

  try {
    const game =
      kind === "bundle" ? await fetchBundlePrice(id) : await fetchGamePrice(id);
    const description = buildDescription(game);

    // Facebook renders a small thumbnail for images under ~600px wide, and the
    // Steam header is only 460×215. Use the larger 616×353 capsule for apps.
    const ogImage =
      kind === "app"
        ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_616x353.jpg`
        : game.imageUrl;

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
        images: ogImage
          ? [{ url: ogImage, width: 616, height: 353, alt: game.name }]
          : [],
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
