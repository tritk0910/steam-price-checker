export type CalcInputs = {
  gamePriceVnd: number;
  keyListPriceVnd: number;
  keyBuyPriceVnd: number;
  marketplaceFeePercent: number;
  giftingRate: number | null;
};

export type TfRoute = {
  netPerKeyVnd: number;
  keysNeeded: number;
  cashPaidVnd: number;
  surplusWalletVnd: number;
  // Cash paid minus the recoverable wallet surplus. This is the figure the
  // gifting route should be compared against — leftover Steam Wallet retains
  // full value and can be spent on a future purchase.
  effectiveCostVnd: number;
};

export type GiftRoute = {
  rate: number;
  totalCostVnd: number;
};

export type CalcResult = {
  tf: TfRoute;
  gift: GiftRoute | null;
  cheapest: "tf" | "gift" | "tie" | null;
  savingsVnd: number | null;
};

export function calculate(inputs: CalcInputs): CalcResult {
  const fee = clamp(inputs.marketplaceFeePercent, 0, 100) / 100;
  const netPerKey = Math.max(0, inputs.keyListPriceVnd * (1 - fee));
  const keysNeeded = netPerKey > 0 ? Math.ceil(inputs.gamePriceVnd / netPerKey) : 0;
  const cashPaid = keysNeeded * inputs.keyBuyPriceVnd;
  const surplus = Math.max(0, keysNeeded * netPerKey - inputs.gamePriceVnd);
  const effective = Math.max(0, cashPaid - surplus);

  const tf: TfRoute = {
    netPerKeyVnd: round(netPerKey),
    keysNeeded,
    cashPaidVnd: round(cashPaid),
    surplusWalletVnd: round(surplus),
    effectiveCostVnd: round(effective),
  };

  const gift: GiftRoute | null =
    inputs.giftingRate && inputs.giftingRate > 0
      ? {
          rate: inputs.giftingRate,
          totalCostVnd: round(inputs.gamePriceVnd * inputs.giftingRate),
        }
      : null;

  let cheapest: CalcResult["cheapest"] = null;
  let savings: number | null = null;
  if (gift) {
    if (tf.effectiveCostVnd < gift.totalCostVnd) {
      cheapest = "tf";
      savings = gift.totalCostVnd - tf.effectiveCostVnd;
    } else if (gift.totalCostVnd < tf.effectiveCostVnd) {
      cheapest = "gift";
      savings = tf.effectiveCostVnd - gift.totalCostVnd;
    } else {
      cheapest = "tie";
      savings = 0;
    }
  } else {
    cheapest = "tf";
  }

  return { tf, gift, cheapest, savingsVnd: savings };
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
