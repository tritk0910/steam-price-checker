export type CalcInputs = {
  gamePriceVnd: number;
  keyListPriceVnd: number;
  marketplaceFeePercent: number;
  giftingRate: number | null;
};

export type TfRoute = {
  netPerKeyVnd: number;
  keysNeeded: number;
  // What the keys-needed pile is worth in Steam Wallet — i.e. keysNeeded ×
  // netPerKey. This is the figure the gifting route is compared against.
  cashPaidVnd: number;
  effectiveCostVnd: number;
  // Steam Wallet left over after spending on the game (cashPaid − gamePrice).
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
  // Cost in Steam Wallet to acquire the game = the wallet you net by selling
  // keysNeeded keys at the marketplace's after-fee rate.
  const cashPaid = keysNeeded * netPerKey;

  const tf: TfRoute = {
    netPerKeyVnd: round(netPerKey),
    keysNeeded,
    cashPaidVnd: round(cashPaid),
    effectiveCostVnd: round(cashPaid),
    walletAfterPurchaseVnd: round(Math.max(0, cashPaid - inputs.gamePriceVnd)),
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
