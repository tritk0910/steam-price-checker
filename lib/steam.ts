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
  priceVnd: number | null;
  discountPercent: number;
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

export async function fetchGamePrice(appid: number): Promise<GamePriceResult> {
  // We intentionally omit `filters` — Steam silently drops `package_groups`
  // whenever a filter list is set, and we need it as a fallback for titles
  // (e.g. Sekiro GOTY in VN) where `price_overview` is absent.
  const { data } = await http.get(`${STEAM_STORE}/api/appdetails`, {
    params: {
      appids: appid,
      cc: "vn",
      l: "english",
    },
  });

  const entry = data?.[String(appid)];
  if (!entry || entry.success !== true || !entry.data) {
    throw new Error("Steam returned no data for this app id.");
  }

  const d = entry.data;
  const price = d.price_overview;

  // Steam returns prices in minor units (price * 100), even for currencies
  // without fractional units like VND. Divide by 100 to get VND.
  let final = typeof price?.final === "number" ? price.final / 100 : null;
  let initial = typeof price?.initial === "number" ? price.initial / 100 : null;
  let discount = typeof price?.discount_percent === "number" ? price.discount_percent : 0;
  let formatted: string | null = price?.final_formatted ?? null;

  const subs = (d.package_groups?.[0]?.subs ?? []) as PackageSub[];

  // Some VN-region titles omit price_overview and only expose pricing via
  // package_groups (e.g. GOTY editions). Fall back to the cheapest sub.
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
      initial = final;
      discount = typeof cheapest.percent_savings === "number" ? cheapest.percent_savings : 0;
      formatted = cheapest.option_text ?? null;
    }
  }

  const gameName = d.name ?? `App ${appid}`;
  const seenPackages = new Set<number>();
  const editions: Edition[] = subs
    .filter((s): s is Required<Pick<PackageSub, "packageid">> & PackageSub =>
      typeof s?.packageid === "number",
    )
    .filter((s) => {
      const id = s.packageid as number;
      if (seenPackages.has(id)) return false;
      seenPackages.add(id);
      return true;
    })
    .map((s) => ({
      packageid: s.packageid as number,
      name: cleanEditionName(s.option_text ?? "", gameName),
      priceVnd:
        typeof s.price_in_cents_with_discount === "number"
          ? s.price_in_cents_with_discount / 100
          : null,
      discountPercent: typeof s.percent_savings === "number" ? s.percent_savings : 0,
    }));

  const dlcAppIds: number[] = Array.isArray(d.dlc)
    ? Array.from(
        new Set(
          d.dlc.filter((id: unknown): id is number => typeof id === "number" && id > 0 && id !== appid),
        ),
      )
    : [];

  return {
    appid,
    name: gameName,
    imageUrl: d.header_image ?? null,
    isFree: Boolean(d.is_free),
    currency: price?.currency ?? "VND",
    priceVnd: final,
    initialPriceVnd: initial,
    discountPercent: discount,
    formatted,
    releaseDate: d.release_date?.date ?? null,
    editions,
    dlcAppIds,
  };
}

function cleanEditionName(optionText: string, gameName: string): string {
  // Steam's option_text is typically "Game Name - Edition Name - 1.290.000₫".
  // Strip the trailing price segment and the leading game-name prefix so the
  // dropdown shows just the edition label (e.g. "Deluxe Edition").
  let name = optionText.trim();
  // Drop any trailing " - <price>" where the price may contain digits, dots,
  // commas, and a currency symbol like ₫.
  name = name.replace(/\s*-\s*[\d.,]+\s*₫\s*$/, "").trim();
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
  option_text?: string;
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
