import axios from "axios";

const STEAM_STORE = "https://store.steampowered.com";
const STEAM_COMMUNITY = "https://steamcommunity.com";

const TF2_APPID = 440;
const TF2_KEY_NAME = "Mann Co. Supply Crate Key";
const CURRENCY_VND = 15;

const http = axios.create({
  timeout: 12_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

export type Edition = {
  packageid: number;
  name: string;
  // VN region (used for TF2/gifting math).
  priceVnd: number | null;
  originalPriceVnd: number | null;
  discountPercent: number;
  // US region (display-only, for the USD toggle).
  priceUsd: number | null;
  originalPriceUsd: number | null;
  discountPercentUsd: number;
};

export type GamePriceResult = {
  appid: number;
  name: string;
  imageUrl: string | null;
  isFree: boolean;
  currency: string;
  priceVnd: number | null;
  discountPercent: number;
  initialPriceVnd: number | null;
  priceUsd: number | null;
  initialPriceUsd: number | null;
  discountPercentUsd: number;
  formatted: string | null;
  releaseDate: string | null;
  editions: Edition[];
  dlcAppIds: number[];
};

export type KeyPriceResult = {
  lowestPriceVnd: number | null;
  medianPriceVnd: number | null;
  volume: number | null;
  rawLowest: string | null;
  rawMedian: string | null;
};

export function extractAppId(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/\/app\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseVndAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // VN locale uses "." for thousands and "," for decimals (e.g. "64.295,13₫").
  // Drop everything that isn't a digit or a separator, then split on the last
  // comma to recover the (rare) fractional part.
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const wholePart = (lastComma >= 0 ? cleaned.slice(0, lastComma) : cleaned).replace(/\./g, "");
  const fracPart = lastComma >= 0 ? cleaned.slice(lastComma + 1) : "";
  const numeric = fracPart ? `${wholePart}.${fracPart}` : wholePart;
  const n = Number(numeric);
  return Number.isFinite(n) ? Math.round(n) : null;
}

type RegionData = {
  final: number | null;
  initial: number | null;
  discountPercent: number;
  formatted: string | null;
  currency: string;
  editions: Map<number, { priceFinal: number | null; originalPriceFinal: number | null; discountPercent: number }>;
};

async function fetchAppdetails(appid: number, cc: string): Promise<AppdetailsData | null> {
  // We intentionally omit `filters` — Steam silently drops `package_groups`
  // whenever a filter list is set, and we need it as a fallback for titles
  // (e.g. Sekiro GOTY in VN) where `price_overview` is absent.
  const { data } = await http.get(`${STEAM_STORE}/api/appdetails`, {
    params: { appids: appid, cc, l: "english" },
  });
  const entry = data?.[String(appid)];
  if (!entry || entry.success !== true || !entry.data) return null;
  return entry.data as AppdetailsData;
}

function parseRegionData(d: AppdetailsData): RegionData {
  const price = d.price_overview;
  // Steam returns prices in minor units (price * 100), even for currencies
  // without fractional units like VND. Divide by 100 to get the local amount.
  let final = typeof price?.final === "number" ? price.final / 100 : null;
  let initial = typeof price?.initial === "number" ? price.initial / 100 : null;
  let discount = typeof price?.discount_percent === "number" ? price.discount_percent : 0;
  let formatted: string | null = price?.final_formatted ?? null;
  const currency = price?.currency ?? "";

  const subs = (d.package_groups?.[0]?.subs ?? []) as PackageSub[];

  // Some titles (e.g. Sekiro GOTY in VN) omit price_overview entirely and
  // only expose pricing via package_groups. Fall back to the cheapest sub.
  if (final == null) {
    let cheapest: PackageSub | null = null;
    for (const s of subs) {
      if (typeof s?.price_in_cents_with_discount !== "number") continue;
      if (!cheapest || s.price_in_cents_with_discount < cheapest.price_in_cents_with_discount!) {
        cheapest = s;
      }
    }
    if (cheapest && typeof cheapest.price_in_cents_with_discount === "number") {
      final = cheapest.price_in_cents_with_discount / 100;
      discount = Math.max(
        parseDiscountPercentFromText(cheapest.percent_savings_text),
        Math.abs(typeof cheapest.percent_savings === "number" ? cheapest.percent_savings : 0),
      );
      initial = discount > 0 ? Math.round(final / (1 - discount / 100)) : final;
      formatted = cheapest.option_text ?? null;
    }
  }

  const editions = new Map<number, { priceFinal: number | null; originalPriceFinal: number | null; discountPercent: number }>();
  for (const s of subs) {
    if (typeof s?.packageid !== "number" || editions.has(s.packageid)) continue;
    const priceFinal =
      typeof s.price_in_cents_with_discount === "number"
        ? s.price_in_cents_with_discount / 100
        : null;
    // Steam often leaves `percent_savings: 0` on discounted subs and hides
    // the real discount inside `percent_savings_text` (e.g. "-85% ").
    const dp = Math.max(
      parseDiscountPercentFromText(s.percent_savings_text),
      Math.abs(typeof s.percent_savings === "number" ? s.percent_savings : 0),
    );
    const originalPriceFinal =
      priceFinal != null && dp > 0 ? Math.round(priceFinal / (1 - dp / 100)) : priceFinal;
    editions.set(s.packageid, { priceFinal, originalPriceFinal, discountPercent: dp });
  }

  return { final, initial, discountPercent: discount, formatted, currency, editions };
}

export async function fetchGamePrice(appid: number): Promise<GamePriceResult> {
  // Pull VN and US prices in parallel. VN is canonical (used for math + names).
  // US is best-effort; if it fails or returns nothing, we just leave USD fields
  // null and fall back to the VND→USD conversion at the UI layer.
  const [vnRes, usRes] = await Promise.allSettled([
    fetchAppdetails(appid, "vn"),
    fetchAppdetails(appid, "us"),
  ]);

  if (vnRes.status === "rejected") throw vnRes.reason;
  const vnData = vnRes.value;
  if (!vnData) throw new Error("Steam returned no data for this app id.");
  const usData = usRes.status === "fulfilled" ? usRes.value : null;

  const vn = parseRegionData(vnData);
  const us = usData ? parseRegionData(usData) : null;

  const gameName = vnData.name ?? `App ${appid}`;
  const subs = (vnData.package_groups?.[0]?.subs ?? []) as PackageSub[];

  const seen = new Set<number>();
  const editions: Edition[] = [];
  for (const s of subs) {
    if (typeof s?.packageid !== "number" || seen.has(s.packageid)) continue;
    seen.add(s.packageid);
    // Skip commercial-license subs (e.g. The Last of Us Part I's "Commercial
    // License"). They're priced for businesses, not consumer purchases.
    if (/commercial\s*license/i.test(s.option_text ?? "")) continue;
    const vnE = vn.editions.get(s.packageid);
    if (!vnE) continue;
    const usE = us?.editions.get(s.packageid);
    editions.push({
      packageid: s.packageid,
      name: cleanEditionName(s.option_text ?? "", gameName),
      priceVnd: vnE.priceFinal,
      originalPriceVnd: vnE.originalPriceFinal,
      discountPercent: vnE.discountPercent,
      priceUsd: usE?.priceFinal ?? null,
      originalPriceUsd: usE?.originalPriceFinal ?? null,
      discountPercentUsd: usE?.discountPercent ?? 0,
    });
  }

  const dlcAppIds: number[] = Array.isArray(vnData.dlc)
    ? Array.from(
        new Set(
          vnData.dlc.filter(
            (id: unknown): id is number => typeof id === "number" && id > 0 && id !== appid,
          ),
        ),
      )
    : [];

  return {
    appid,
    name: gameName,
    imageUrl: vnData.header_image ?? null,
    isFree: Boolean(vnData.is_free),
    currency: vn.currency || "VND",
    priceVnd: vn.final,
    initialPriceVnd: vn.initial,
    discountPercent: vn.discountPercent,
    priceUsd: us?.final ?? null,
    initialPriceUsd: us?.initial ?? null,
    discountPercentUsd: us?.discountPercent ?? 0,
    formatted: vn.formatted,
    releaseDate: vnData.release_date?.date ?? null,
    editions,
    dlcAppIds,
  };
}

type AppdetailsData = {
  name?: string;
  is_free?: boolean;
  header_image?: string;
  price_overview?: {
    final?: number;
    initial?: number;
    discount_percent?: number;
    final_formatted?: string;
    currency?: string;
  };
  release_date?: { date?: string };
  dlc?: unknown[];
  package_groups?: Array<{ subs?: PackageSub[] }>;
};

function cleanEditionName(optionText: string, gameName: string): string {
  // Steam's option_text is typically "Game Name - Edition Name - 1.290.000₫".
  // Discounted subs splice in raw HTML for the strikethrough original price,
  // e.g. "DMC5 + Vergil - <span class=\"discount_original_price\">620.000₫</span> 93.000₫".
  // Strip tags first, then strip ALL trailing price segments, then the leading
  // game-name prefix.
  let name = optionText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  // Repeatedly drop a trailing price (number with separators + optional ₫).
  // Allows both "... 93.000₫" and "... - 93.000₫".
  for (let i = 0; i < 3; i++) {
    const next = name.replace(/(?:\s*-\s*|\s+)[\d.,]+\s*₫?\s*$/, "").trim();
    if (next === name) break;
    name = next;
  }
  const prefix = `${gameName} -`;
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    name = name.slice(prefix.length).trim();
  }
  return name || gameName;
}

type PackageSub = {
  packageid?: number;
  price_in_cents_with_discount?: number;
  percent_savings?: number;
  percent_savings_text?: string;
  option_text?: string;
};

function parseDiscountPercentFromText(text: string | undefined): number {
  if (!text) return 0;
  const m = text.match(/(\d+)\s*%/);
  return m ? Number(m[1]) : 0;
}

export type SearchResult = {
  appid: number;
  name: string;
  tinyImage: string | null;
  priceVnd: number | null;
  formatted: string | null;
};

export async function searchSteam(term: string): Promise<SearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const { data } = await http.get(`${STEAM_STORE}/api/storesearch/`, {
    params: { term: trimmed, l: "english", cc: "vn" },
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.slice(0, 8).map((item: SearchHit) => {
    const priceCents = item?.price?.final;
    return {
      appid: Number(item.id),
      name: item.name ?? `App ${item.id}`,
      tinyImage: item.tiny_image ?? null,
      priceVnd: typeof priceCents === "number" ? priceCents / 100 : null,
      formatted: item.price?.final ? null : null,
    };
  });
}

type SearchHit = {
  id?: number | string;
  name?: string;
  tiny_image?: string;
  price?: { final?: number; currency?: string };
};

export async function fetchTf2KeyPrice(): Promise<KeyPriceResult> {
  const { data } = await http.get(`${STEAM_COMMUNITY}/market/priceoverview/`, {
    params: {
      appid: TF2_APPID,
      currency: CURRENCY_VND,
      market_hash_name: TF2_KEY_NAME,
    },
  });

  if (!data || data.success !== true) {
    throw new Error("Steam Market did not return a successful response for TF2 keys.");
  }

  const volume = typeof data.volume === "string" ? Number(data.volume.replace(/[^\d]/g, "")) : null;

  return {
    lowestPriceVnd: parseVndAmount(data.lowest_price),
    medianPriceVnd: parseVndAmount(data.median_price),
    volume: Number.isFinite(volume) ? volume : null,
    rawLowest: data.lowest_price ?? null,
    rawMedian: data.median_price ?? null,
  };
}
