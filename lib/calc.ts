export type CalcInputs = {
  gamePriceVnd: number;
  // Steam Market list price for one TF2 key. Drives the wallet you net after
  // the marketplace fee (keyListPrice × (1 − fee)).
  keyListPriceVnd: number;
  // Cash price you actually pay per key — typically the rate a Vietnamese
  // trader charges, which is lower than the Steam Market list because the
  // trader doesn't pay the marketplace fee on every transaction.
  keyBuyPriceVnd: number;
  marketplaceFeePercent: number;
  giftingRate: number | null;
};

export type TfRoute = {
  netPerKeyVnd: number;
  keysNeeded: number;
  // Real money spent to acquire the keys (keys × Steam Market price). This is
  // the figure compared against the gifting route.
  cashPaidVnd: number;
  effectiveCostVnd: number;
  // Steam Wallet left over after the game is bought. Shown for reference only;
  // it is NOT subtracted from the effective cost.
  walletAfterPurchaseVnd: number;
};

export type GiftRoute = {
  rate: number;
  totalCostVnd: number;
};

export type CalcResult = {
  tf: TfRoute;
  gift: GiftRoute | null;
  cheapest: "tf" | "gift" | "tie" | null;
  // Savings of the cheapest route compared to paying the Steam VN sticker price.
  // Positive = cheaper than direct purchase, negative = costlier (cleverness backfired).
  savingsVsDirectVnd: number | null;
};

export function calculate(inputs: CalcInputs): CalcResult {
  const fee = clamp(inputs.marketplaceFeePercent, 0, 100) / 100;
  const netPerKey = Math.max(0, inputs.keyListPriceVnd * (1 - fee));
  const keysNeeded = netPerKey > 0 ? Math.ceil(inputs.gamePriceVnd / netPerKey) : 0;
  const walletReceived = keysNeeded * netPerKey;
  // Cash you pay for the keys is the trader rate, not the Steam Market price.
  const cashPaid = keysNeeded * Math.max(0, inputs.keyBuyPriceVnd);
  const walletAfter = Math.max(0, walletReceived - inputs.gamePriceVnd);

  const tf: TfRoute = {
    netPerKeyVnd: round(netPerKey),
    keysNeeded,
    cashPaidVnd: round(cashPaid),
    effectiveCostVnd: round(cashPaid),
    walletAfterPurchaseVnd: round(walletAfter),
  };

  const gift: GiftRoute | null =
    inputs.giftingRate && inputs.giftingRate > 0
      ? {
          rate: inputs.giftingRate,
          totalCostVnd: round(inputs.gamePriceVnd * inputs.giftingRate),
        }
      : null;

  let cheapest: CalcResult["cheapest"] = null;
  let cheapestCost: number | null = null;
  if (gift) {
    if (tf.effectiveCostVnd < gift.totalCostVnd) {
      cheapest = "tf";
      cheapestCost = tf.effectiveCostVnd;
    } else if (gift.totalCostVnd < tf.effectiveCostVnd) {
      cheapest = "gift";
      cheapestCost = gift.totalCostVnd;
    } else {
      cheapest = "tie";
      cheapestCost = gift.totalCostVnd;
    }
  } else {
    cheapest = "tf";
    cheapestCost = tf.effectiveCostVnd;
  }

  const savingsVsDirect =
    cheapestCost != null ? round(inputs.gamePriceVnd - cheapestCost) : null;

  return { tf, gift, cheapest, savingsVsDirectVnd: savingsVsDirect };
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(n: number) {
  return Math.round(n);
}

export function formatVnd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("vi-VN")} ₫`;
}

export function formatUsd(n: number | null | undefined, vndPerUsd: number): string {
  if (n == null || !Number.isFinite(n) || !vndPerUsd) return "—";
  return (n / vndPerUsd).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format an amount that is *already* in USD (no exchange conversion). Used for
// Steam US prices fetched directly from the store, where converting via the
// VND/USD rate would be wrong.
export function formatUsdNative(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Steam release dates arrive as English strings like "23 Mar, 2023" or
// "Coming soon". Try to parse the date and reformat for the active locale;
// unparseable values (e.g. "Coming soon") fall through unchanged.
export function formatReleaseDate(
  raw: string | null | undefined,
  locale: string,
): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
