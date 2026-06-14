export type CartEntryItem = {
  key: string;
  label: string;
  priceVnd: number | null;
  priceUsd: number | null;
};

export type CartEntry = {
  id: string; // `${kind}-${appid}`
  appid: number;
  kind: "app" | "bundle";
  name: string;
  imageUrl: string | null;
  items: CartEntryItem[];
  totalVnd: number | null;
  // Native Steam USD total (US store price). Null if any selected item lacks a
  // USD price — in that case display falls back to converting totalVnd.
  totalUsd: number | null;
};
