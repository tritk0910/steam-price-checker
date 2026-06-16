"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQueries, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, ExternalLink, Link2, Loader2, RefreshCw, Search, ShoppingCart, X } from "lucide-react";

import { VersionsCard, type SelectedItem } from "@/components/versions-card";
import { calculate, formatReleaseDate, formatUsd, formatUsdNative, formatVnd } from "@/lib/calc";
import { useCurrency } from "@/lib/currency-context";
import { useSearchHistory, type HistoryEntry } from "@/lib/history";
import {
  extractSteamItem,
  type GamePriceResult,
  type KeyPriceResult,
  type SearchResult,
  type SteamItemRef,
} from "@/lib/steam";
import { cn } from "@/lib/utils";
import { useGsapIntro } from "@/hooks/use-gsap-intro";
import { CartCard } from "@/components/cart-card";
import { useCart } from "@/lib/use-cart";

const DEFAULT_FEE = 13;
const DEFAULT_GIFT_RATE = 0.8;
const DEFAULT_KEY_BUY_PRICE = 46_000;
const DEFAULT_VND_PER_USD = 25_500;

class GameFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GameFetchError";
  }
}

async function fetchItem(ref: SteamItemRef): Promise<GamePriceResult> {
  const url = ref.kind === "bundle" ? `/api/bundle/${ref.id}` : `/api/game/${ref.id}`;
  try {
    const { data } = await axios.get<GamePriceResult>(url);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const message = (err.response.data as { error?: string } | undefined)?.error ?? err.message;
      throw new GameFetchError(message, err.response.status);
    }
    throw err;
  }
}

async function fetchGame(appid: number): Promise<GamePriceResult> {
  return fetchItem({ kind: "app", id: appid });
}

async function fetchKey(): Promise<KeyPriceResult> {
  const { data } = await axios.get<KeyPriceResult>(`/api/tf2-key`);
  return data;
}

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const { data } = await axios.get<{ results: SearchResult[] }>(`/api/search`, {
    params: { q },
  });
  return data.results ?? [];
}

async function fetchExchangeRate(): Promise<number | null> {
  try {
    const { data } = await axios.get<{ vndPerUsd: number }>(`/api/exchange-rate`);
    return typeof data.vndPerUsd === "number" ? data.vndPerUsd : null;
  } catch {
    return null;
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}


export function Calculator() {
  const t = useTranslations();
  const locale = useLocale();
  useGsapIntro(locale);

  const [urlInput, setUrlInput] = useState("");
  const [rootItem, setRootItem] = useState<SteamItemRef | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"single" | "multi">("single");

  const [feePercent, setFeePercent] = useState<string>(String(DEFAULT_FEE));
  const [keyBuyPrice, setKeyBuyPrice] = useState<string>(String(DEFAULT_KEY_BUY_PRICE));
  const [giftRate, setGiftRate] = useState<string>(String(DEFAULT_GIFT_RATE));

  const { showUsd } = useCurrency();
  const [vndPerUsd, setVndPerUsd] = useState<string>(String(DEFAULT_VND_PER_USD));
  const userTouchedRateRef = useRef(false);
  const urlRestoredRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  // URL bar focus state for the focus-ring effect
  const [urlFocused, setUrlFocused] = useState(false);

  const { history, addEntry: addToHistory, removeEntry: removeFromHistory } = useSearchHistory();
  const { entries: cartEntries, addEntry: addToCart, removeEntry: removeFromCart, reorderEntries: reorderCart, clear: clearCart } = useCart();
  const [addedFlash, setAddedFlash] = useState(false);
  const [copied, setCopied] = useState(false);

  const debouncedFee = useDebouncedValue(feePercent, 300);
  const debouncedKeyBuy = useDebouncedValue(keyBuyPrice, 300);
  const debouncedGiftRate = useDebouncedValue(giftRate, 300);
  const debouncedVnd = useDebouncedValue(vndPerUsd, 300);

  const rateQuery = useQuery({
    queryKey: ["exchange-rate"],
    queryFn: fetchExchangeRate,
    staleTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    if (!userTouchedRateRef.current && typeof rateQuery.data === "number") {
      setVndPerUsd(String(rateQuery.data));
    }
  }, [rateQuery.data]);

  const parsedItemFromInput = extractSteamItem(urlInput);

  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(urlInput, 300);
  const hasSearchTerm = debouncedQuery.trim().length >= 2;
  const isSearchable = !parsedItemFromInput && hasSearchTerm && searchOpen;
  const searchQuery = useQuery({
    queryKey: ["search", debouncedQuery.trim()],
    queryFn: () => fetchSearch(debouncedQuery.trim()),
    enabled: isSearchable,
    staleTime: 5 * 60 * 1000,
  });

  const previewQuery = useQuery({
    queryKey: ["item", parsedItemFromInput?.kind, parsedItemFromInput?.id],
    queryFn: () => fetchItem(parsedItemFromInput!),
    enabled: parsedItemFromInput != null && searchOpen,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const showPopover =
    searchOpen && (parsedItemFromInput != null || hasSearchTerm || history.length > 0);

  const rootGameQuery = useQuery({
    queryKey: ["item", rootItem?.kind, rootItem?.id],
    queryFn: () => fetchItem(rootItem!),
    enabled: rootItem != null,
  });

  const loadedAppId = rootGameQuery.data?.appid ?? null;
  const loadedKind = rootGameQuery.data?.kind ?? null;
  const loadedName = rootGameQuery.data?.name;
  const loadedImage = rootGameQuery.data?.imageUrl;
  useEffect(() => {
    if (loadedAppId == null || !loadedName || loadedKind !== "app") return;
    addToHistory({ appid: loadedAppId, name: loadedName, image: loadedImage ?? null });
  }, [loadedAppId, loadedKind, loadedName, loadedImage, addToHistory]);

  const firstEditionKey = rootGameQuery.data?.editions[0]?.packageid;
  useEffect(() => {
    // Skip auto-select when selectedKeys were already restored from the URL.
    if (firstEditionKey != null && !urlRestoredRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKeys([`pkg-${firstEditionKey}`]);
    }
  }, [firstEditionKey]);

  // Mount — restore state from URL query-params once (client-only).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const kind = params.get("kind") as "app" | "bundle" | null;
    const idRaw = params.get("id");
    if (kind && idRaw && (kind === "app" || kind === "bundle")) {
      const id = Number(idRaw);
      if (Number.isFinite(id) && id > 0) {
        setRootItem({ kind, id });
        setUrlInput(
          `https://store.steampowered.com/${kind === "bundle" ? "bundle" : "app"}/${id}/`,
        );
        const keysRaw = params.get("keys");
        if (keysRaw) {
          const restored = keysRaw.split(",").filter(Boolean);
          if (restored.length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedKeys(restored);
            urlRestoredRef.current = true;
          }
        }
        const modeRaw = params.get("mode");
        if (modeRaw === "single" || modeRaw === "multi") setSelectionMode(modeRaw);
      }
    }

    const fee = params.get("fee"); if (fee) setFeePercent(fee);
    const kbuy = params.get("kbuy"); if (kbuy) setKeyBuyPrice(kbuy);
    const gift = params.get("gift"); if (gift) setGiftRate(gift);
    const vnd = params.get("vnd");
    if (vnd) {
      setVndPerUsd(vnd);
      userTouchedRateRef.current = true;
    }

    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live URL sync — mirrors state into the address bar after mount hydration.
  useEffect(() => {
    if (!hydrated) return;

    const p = new URLSearchParams();
    if (rootItem) {
      p.set("kind", rootItem.kind);
      p.set("id", String(rootItem.id));
      if (selectedKeys.length > 0) p.set("keys", selectedKeys.join(","));
      p.set("mode", selectionMode);
    }
    p.set("fee", debouncedFee);
    p.set("kbuy", debouncedKeyBuy);
    p.set("gift", debouncedGiftRate);
    p.set("vnd", debouncedVnd);

    router.replace(`?${p.toString()}`, { scroll: false });
  }, [hydrated, rootItem, selectedKeys, selectionMode, debouncedFee, debouncedKeyBuy, debouncedGiftRate, debouncedVnd, router]);

  const selectedDlcAppIds = selectedKeys
    .filter((k) => k.startsWith("dlc-"))
    .map((k) => Number(k.slice(4)))
    .filter((n) => Number.isFinite(n));
  const dlcQueries = useQueries({
    queries: selectedDlcAppIds.map((id) => ({
      queryKey: ["game", id],
      queryFn: () => fetchGame(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const keyQuery = useQuery({
    queryKey: ["tf2-key"],
    queryFn: fetchKey,
  });

  const selectedItems: SelectedItem[] = selectedKeys
    .map((key): SelectedItem | null => {
      if (key.startsWith("pkg-")) {
        const id = Number(key.slice(4));
        const edition = rootGameQuery.data?.editions.find((e) => e.packageid === id);
        if (!edition || !rootGameQuery.data) return null;
        return {
          key,
          kind: "package",
          appid: rootGameQuery.data.appid,
          name: edition.name,
          imageUrl: rootGameQuery.data.imageUrl ?? null,
          releaseDate: rootGameQuery.data.releaseDate,
          priceVnd: edition.priceVnd,
          originalPriceVnd: edition.originalPriceVnd,
          discountPercent: edition.discountPercent,
          priceUsd: edition.priceUsd,
          originalPriceUsd: edition.originalPriceUsd,
          discountPercentUsd: edition.discountPercentUsd,
        };
      }
      if (key.startsWith("dlc-")) {
        const id = Number(key.slice(4));
        const idx = selectedDlcAppIds.indexOf(id);
        const data = idx >= 0 ? dlcQueries[idx]?.data : null;
        if (!data) return null;
        return {
          key,
          kind: "dlc",
          appid: data.appid,
          name: data.name,
          imageUrl: data.imageUrl,
          releaseDate: data.releaseDate,
          priceVnd: data.priceVnd,
          originalPriceVnd: data.initialPriceVnd,
          discountPercent: data.discountPercent,
          priceUsd: data.priceUsd,
          originalPriceUsd: data.initialPriceUsd,
          discountPercentUsd: data.discountPercentUsd,
        };
      }
      return null;
    })
    .filter((x): x is SelectedItem => x != null);

  const isBundle = rootGameQuery.data?.kind === "bundle";
  const totalVnd = isBundle
    ? (rootGameQuery.data?.priceVnd ?? null)
    : selectedItems.reduce((sum, i) => sum + (i.priceVnd ?? 0), 0) || null;
  const totalUsd = isBundle
    ? (rootGameQuery.data?.priceUsd ?? null)
    : selectedItems.every((i) => i.priceUsd != null)
      ? selectedItems.reduce((sum, i) => sum + (i.priceUsd ?? 0), 0)
      : null;

  const rootName = rootGameQuery.data?.name ?? "";
  const displayedImageUrl =
    selectedItems.length === 1
      ? (selectedItems[0].imageUrl ?? rootGameQuery.data?.imageUrl ?? null)
      : (rootGameQuery.data?.imageUrl ?? null);
  const displayedName =
    selectedItems.length === 1 ? labelForSelectedItem(selectedItems[0], rootName) : rootName;

  const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null;

  const displayedGame: GamePriceResult | null = rootGameQuery.data
    ? {
        ...rootGameQuery.data,
        appid: singleSelected?.appid ?? rootGameQuery.data.appid,
        name: displayedName,
        imageUrl: displayedImageUrl,
        releaseDate: singleSelected?.releaseDate ?? rootGameQuery.data.releaseDate,
        priceVnd: totalVnd,
        initialPriceVnd: isBundle ? rootGameQuery.data.initialPriceVnd : null,
        discountPercent: isBundle ? rootGameQuery.data.discountPercent : 0,
        priceUsd: totalUsd,
        initialPriceUsd: isBundle ? rootGameQuery.data.initialPriceUsd : null,
        discountPercentUsd: isBundle ? rootGameQuery.data.discountPercentUsd : 0,
        formatted: null,
      }
    : null;

  const displayedSteamUrl = !displayedGame
    ? null
    : displayedGame.kind === "bundle"
      ? `https://store.steampowered.com/bundle/${displayedGame.appid}/`
      : `https://store.steampowered.com/app/${displayedGame.appid}/`;

  const displayedQuery = rootGameQuery;

  const marketKeyPrice = keyQuery.data?.lowestPriceVnd ?? null;
  const effectiveFee = parseNumber(feePercent) ?? DEFAULT_FEE;
  const effectiveKeyBuy = parseNumber(keyBuyPrice) ?? DEFAULT_KEY_BUY_PRICE;
  const effectiveGiftRate = parseNumber(giftRate);
  const usdRate = parseNumber(vndPerUsd) ?? DEFAULT_VND_PER_USD;

  const gamePriceVnd = displayedGame?.priceVnd ?? null;
  const result =
    gamePriceVnd && marketKeyPrice
      ? calculate({
          gamePriceVnd,
          keyListPriceVnd: marketKeyPrice,
          keyBuyPriceVnd: effectiveKeyBuy,
          marketplaceFeePercent: effectiveFee,
          giftingRate: effectiveGiftRate,
        })
      : null;

  const handleAddToCart = () => {
    if (!displayedGame || !totalVnd) return;
    addToCart({
      id: `${displayedGame.kind}-${displayedGame.appid}`,
      appid: displayedGame.appid,
      kind: displayedGame.kind,
      name: displayedGame.name,
      imageUrl: displayedGame.imageUrl,
      items: isBundle
        ? [{ key: "bundle", label: displayedGame.name, priceVnd: displayedGame.priceVnd, priceUsd: displayedGame.priceUsd }]
        : selectedItems.map((i) => ({
            key: i.key,
            label: labelForSelectedItem(i, rootName),
            priceVnd: i.priceVnd,
            priceUsd: i.priceUsd,
          })),
      totalVnd,
      totalUsd,
    });
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1500);
  };

  const loadItem = (
    ref: SteamItemRef,
    urlIfKnown?: string,
    initialKeys?: string[],
    initialMode?: "single" | "multi",
  ) => {
    if (initialKeys && initialKeys.length > 0) {
      urlRestoredRef.current = true;
      setSelectedKeys(initialKeys);
      if (initialMode) setSelectionMode(initialMode);
    } else {
      urlRestoredRef.current = false;
      setSelectedKeys([]);
    }
    setRootItem(ref);
    const fallback =
      ref.kind === "bundle"
        ? `https://store.steampowered.com/bundle/${ref.id}/`
        : `https://store.steampowered.com/app/${ref.id}/`;
    setUrlInput(urlIfKnown ?? fallback);
    setSearchOpen(false);
  };

  const onSelectionModeChange = (mode: "single" | "multi") => {
    setSelectionMode(mode);
    if (mode === "single" && selectedKeys.length > 1) {
      const baseKey = firstEditionKey != null ? `pkg-${firstEditionKey}` : null;
      setSelectedKeys(baseKey ? [baseKey] : []);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedItemFromInput) loadItem(parsedItemFromInput, urlInput);
  };

  const fmt = (v: number | null | undefined) =>
    showUsd ? formatUsd(v ?? null, usdRate) : formatVnd(v ?? null);

  const fmtPair = (vnd: number | null | undefined, usd: number | null | undefined) => {
    if (showUsd) {
      return usd != null ? formatUsdNative(usd) : formatUsd(vnd ?? null, usdRate);
    }
    return formatVnd(vnd ?? null);
  };

  const quickLinks = [
    { label: "Forza Horizon 5", appid: 1551360 },
    { label: "Elden Ring", appid: 1245620 },
    { label: "Black Myth: Wukong", appid: 2358720 },
  ];

  return (
    <div className="relative z-1 mx-auto max-w-285 px-8 pt-21.5 max-sm:px-4.5">
      {/* ── HERO ── */}
      <header className="relative z-10 max-w-190 pt-13.5 pb-7.5 max-sm:pt-14">
        <div
          data-eyebrow
          className="font-code mb-5.5 inline-flex items-center gap-2 rounded-full border border-hi-border bg-hi-bg px-3.5 py-1.5 text-[11.5px] text-hi-text-strong tracking-[0.14em] uppercase"
        >
          <span
            className="bg-hi h-1.5 w-1.5 shrink-0 rounded-full shadow-glow"
          />
          <span>{t("hero.eyebrow")}</span>
        </div>

        <h1
          data-gsap-h1
          className="font-heading text-ink text-[clamp(38px,5.2vw,58px)] leading-[1.06] font-bold tracking-tight text-balance"
        >
          {t("hero.h1Plain")}{" "}
          <em
            className="bg-clip-text text-gradient-hi text-transparent not-italic"
          >
            {t("hero.h1Accent")}
          </em>
          {t("hero.h1Tail")}
        </h1>

        <p data-lede className="text-ink-2 mt-4.5 max-w-[56ch] text-[16.5px] text-pretty">
          {t("hero.lede")}
        </p>

        <form onSubmit={onSubmit}>
          <div
            data-urlbar
            className={cn(
              "bg-card-glass mt-8.5 flex gap-2.5 rounded-[18px] border p-2.5 backdrop-blur-[18px] transition-[border-color,box-shadow] duration-200 max-sm:flex-col",
              urlFocused
                ? "border-[color-mix(in_oklab,var(--accent-hex)_55%,transparent)] shadow-search-focus"
                : "border-line shadow-search",
            )}
          >
            <div className="relative flex flex-1 items-center">
              <input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  setSearchOpen(true);
                  setUrlFocused(true);
                }}
                onBlur={() => {
                  setTimeout(() => setSearchOpen(false), 150);
                  setUrlFocused(false);
                }}
                placeholder={t("steps.game.placeholder")}
                spellCheck={false}
                className="text-ink font-code placeholder:text-ink-3 min-w-0 flex-1 appearance-none border-none bg-transparent px-3 text-[13.5px] outline-none max-sm:py-3"
              />
              {urlInput ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setUrlInput("");
                    setSearchOpen(true);
                  }}
                  aria-label={t("steps.game.clear")}
                  className="text-ink-3 absolute right-2 flex cursor-pointer items-center border-none bg-transparent p-1"
                >
                  <X size={14} />
                </button>
              ) : null}
              {showPopover ? (
                <SearchResultsPopover
                  query={searchQuery}
                  previewQuery={previewQuery}
                  previewItem={parsedItemFromInput}
                  hasSearchTerm={hasSearchTerm}
                  history={history}
                  onPick={(ref) => loadItem(ref)}
                  onRemoveHistory={removeFromHistory}
                  format={fmtPair}
                />
              ) : null}
            </div>
            <button
              type="submit"
              disabled={!parsedItemFromInput}
              className="btn-primary inline-flex h-11.5 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] border-none px-6 font-sans text-[14px] font-semibold whitespace-nowrap text-[#061018] transition-[transform,filter] duration-150 hover:-translate-y-px hover:brightness-[1.08] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 max-sm:h-11 max-sm:justify-center"
            >
              {rootGameQuery.isFetching ? (
                <Loader2 size={15} className="animate-[spin_0.7s_linear_infinite]" />
              ) : (
                <ArrowRight size={15} aria-hidden />
              )}
              {t("steps.game.submit")}
            </button>
          </div>
        </form>

        <div
          data-url-hint
          className="text-ink-3 mt-3 flex flex-wrap items-center gap-3.5 text-[12.5px]"
        >
          <span>{t("hero.tryLabel")}</span>
          {quickLinks.map(({ label, appid }) => (
            <code
              key={appid}
              onClick={() => loadItem({ kind: "app", id: appid })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && loadItem({ kind: "app", id: appid })}
              className="font-code border-line-soft hover:border-hi hover:text-ink cursor-pointer rounded-[6px] border bg-white/5 px-1.75 py-0.5 text-[11.5px] transition-[border-color,color] duration-150"
            >
              {label}
            </code>
          ))}
        </div>
      </header>

      {/* ── DASHBOARD GRID ── */}
      <main
        id="dash"
        className="mt-6 grid grid-cols-[1fr_1fr] gap-4.5 max-[920px]:grid-cols-1 sm:mt-13.5"
      >
        {/* Card 01+02 — Game info + Editions */}
        <section id="game-info" className="bg-card-glass border-line reveal relative row-span-2 flex flex-col rounded-[18px] border p-6 backdrop-blur-[18px] max-[920px]:row-auto">
          <div data-card-head className="mb-1.5 flex items-center justify-between">
            <div className="font-heading text-ink flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em]">
              <span
                data-step-num
                className="font-code grid h-5.5 w-5.5 shrink-0 place-items-center rounded-[7px] border border-hi-border text-[10.5px] text-hi-text"
              >
                01
              </span>
              <span>{t("steps.summary.title")}</span>
            </div>
            {rootItem != null ? (
              <button
                type="button"
                onClick={() => {
                  urlRestoredRef.current = false;
                  setRootItem(null);
                  setSelectedKeys([]);
                  setSelectionMode("single");
                  setUrlInput("");
                }}
                aria-label="Clear game"
                className="border-line text-ink-2 hover:text-ink hover:border-hi grid h-8 w-8 shrink-0 cursor-pointer appearance-none place-items-center rounded-[9px] border bg-white/5 transition-[color,border-color] duration-150"
              >
                <X size={14} aria-hidden />
              </button>
            ) : null}
          </div>
          <GameSummary
            query={displayedQuery}
            displayed={displayedGame}
            steamUrl={displayedSteamUrl}
            hasSelection={selectedKeys.length > 0}
            format={fmtPair}
          />

          <div
            data-card-head
            className="mt-6.5 mb-1.5 flex items-center justify-between"
          >
            <div className="font-heading text-ink flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em]">
              <span
                data-step-num
                className="font-code grid h-5.5 w-5.5 shrink-0 place-items-center rounded-[7px] border border-hi-border text-[10.5px] text-hi-text"
              >
                02
              </span>
              <span>{t("steps.versions.title")}</span>
            </div>
          </div>
          <p data-card-sub className="text-ink-3 text-[12.5px]">
            {t("steps.versions.description")}
          </p>
          <VersionsCard
            rootGame={rootGameQuery.data ?? null}
            selectedKeys={selectedKeys}
            onChange={setSelectedKeys}
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            format={fmtPair}
            noCard
          />
          {(rootItem != null || (displayedGame != null && totalVnd != null)) ? (
            <div className="mt-5 flex items-center justify-between gap-2.5">
              {rootItem != null ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="btn-primary inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border-none px-4 text-[12.5px] font-semibold whitespace-nowrap text-[#061018] transition-[transform,filter] duration-150 hover:-translate-y-px hover:brightness-[1.08] active:translate-y-0"
                >
                  {copied ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
                  {copied ? "Copied!" : "Share"}
                </button>
              ) : null}
              {displayedGame && totalVnd ? (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-hi-border bg-hi-bg px-4 text-[12.5px] font-semibold text-hi-text-strong transition-[transform,filter,opacity] duration-150 hover:-translate-y-px hover:brightness-[1.08] active:translate-y-0",
                    addedFlash && "opacity-60",
                  )}
                >
                  <ShoppingCart size={13} aria-hidden />
                  {addedFlash ? t("cart.added") : t("cart.addToCart")}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Card 03 — TF2 Key */}
        <section
          className="bg-card-glass border-line reveal relative rounded-[18px] border p-6 backdrop-blur-[18px] [animation-delay:0.06s]"
        >
          <div data-card-head className="mb-1.5 flex items-center justify-between">
            <div className="font-heading text-ink flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em]">
              <span
                data-step-num
                className="font-code grid h-5.5 w-5.5 shrink-0 place-items-center rounded-[7px] border border-hi-border text-[10.5px] text-hi-text"
              >
                03
              </span>
              <span>{t("steps.key.title")}</span>
            </div>
            <button
              type="button"
              onClick={() => keyQuery.refetch()}
              disabled={keyQuery.isFetching}
              aria-label={t("steps.key.refresh")}
              className="border-line text-ink-2 hover:text-ink hover:border-hi grid h-8 w-8 shrink-0 cursor-pointer appearance-none place-items-center rounded-[9px] border bg-white/5 transition-[color,border-color] duration-150 disabled:opacity-60"
            >
              {keyQuery.isFetching ? (
                <Loader2 size={14} className="animate-[spin_0.7s_linear_infinite]" />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
            </button>
          </div>
          <div data-card-sub className="text-ink-3 text-[12.5px]">
            {t("steps.key.description")}
          </div>
          <KeySummary query={keyQuery} format={fmt} />
        </section>

        {/* Card 04 — Params */}
        <section
          className="bg-card-glass border-line reveal relative rounded-[18px] border p-6 backdrop-blur-[18px] [animation-delay:0.12s]"
        >
          <div data-card-head className="mb-1.5 flex items-center justify-between">
            <div className="font-heading text-ink flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em]">
              <span
                data-step-num
                className="font-code grid h-5.5 w-5.5 shrink-0 place-items-center rounded-[7px] border border-hi-border text-[10.5px] text-hi-text"
              >
                04
              </span>
              <span>{t("steps.params.title")}</span>
            </div>
          </div>
          <div data-card-sub className="text-ink-3 text-[12.5px]">
            {t("steps.params.description")}
          </div>
          <div className="mt-4.5 grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
            <div>
              <label
                htmlFor="p-fee"
                className="text-ink-2 mb-1.5 block text-[11.5px] tracking-[0.02em]"
              >
                {t("steps.params.feeLabel")}
              </label>
              <input
                id="p-fee"
                inputMode="decimal"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                className="border-line text-ink font-code w-full appearance-none rounded-[10px] border bg-black/30 px-3 py-2.25 text-[13.5px] transition-[border-color,box-shadow] duration-150 outline-none focus:border-[color-mix(in_oklab,var(--accent-hex)_60%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-hex)_12%,transparent)]"
              />
              <div className="text-ink-3 mt-1.25 text-[10.5px] leading-[1.4]">
                {t("steps.params.feeHint")}
              </div>
            </div>
            <div>
              <label
                htmlFor="p-key"
                className="text-ink-2 mb-1.5 block text-[11.5px] tracking-[0.02em]"
              >
                {t("steps.params.keyBuyLabel")}
              </label>
              <input
                id="p-key"
                inputMode="numeric"
                value={keyBuyPrice}
                onChange={(e) => setKeyBuyPrice(e.target.value)}
                placeholder={String(DEFAULT_KEY_BUY_PRICE)}
                className="border-line text-ink font-code w-full appearance-none rounded-[10px] border bg-black/30 px-3 py-2.25 text-[13.5px] transition-[border-color,box-shadow] duration-150 outline-none focus:border-[color-mix(in_oklab,var(--accent-hex)_60%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-hex)_12%,transparent)]"
              />
              <div className="text-ink-3 mt-1.25 text-[10.5px] leading-[1.4]">
                {t("steps.params.keyBuyHint")}
              </div>
            </div>
            <div>
              <label
                htmlFor="p-ratio"
                className="text-ink-2 mb-1.5 block text-[11.5px] tracking-[0.02em]"
              >
                {t("steps.params.giftRateLabel")}
              </label>
              <input
                id="p-ratio"
                inputMode="decimal"
                value={giftRate}
                onChange={(e) => setGiftRate(e.target.value)}
                placeholder="0.80"
                className="border-line text-ink font-code w-full appearance-none rounded-[10px] border bg-black/30 px-3 py-2.25 text-[13.5px] transition-[border-color,box-shadow] duration-150 outline-none focus:border-[color-mix(in_oklab,var(--accent-hex)_60%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-hex)_12%,transparent)]"
              />
              <div className="text-ink-3 mt-1.25 text-[10.5px] leading-[1.4]">
                {t("steps.params.giftRateHint")}
              </div>
            </div>
            <div>
              <label
                htmlFor="p-fx"
                className="text-ink-2 mb-1.5 block text-[11.5px] tracking-[0.02em]"
              >
                {t("steps.params.usdRateLabel")}
              </label>
              <input
                id="p-fx"
                inputMode="numeric"
                value={vndPerUsd}
                onChange={(e) => {
                  userTouchedRateRef.current = true;
                  setVndPerUsd(e.target.value);
                }}
                className="border-line text-ink font-code w-full appearance-none rounded-[10px] border bg-black/30 px-3 py-2.25 text-[13.5px] transition-[border-color,box-shadow] duration-150 outline-none focus:border-[color-mix(in_oklab,var(--accent-hex)_60%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-hex)_12%,transparent)]"
              />
              <div className="text-ink-3 mt-1.25 text-[10.5px] leading-[1.4]">
                {t("steps.params.usdRateHint")}
              </div>
            </div>
          </div>
        </section>

        {/* Card 05 — Verdict (full width) */}
        {result && displayedGame?.priceVnd ? (
          <section
            className="bg-card-glass border-line reveal col-span-full overflow-hidden rounded-[18px] border p-0 backdrop-blur-[18px] [animation-delay:0.18s]"
          >
            {/* verdict-inner */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch max-[920px]:grid-cols-1">
              {/* Gift route */}
              <div
                className={cn(
                  "flex flex-col gap-1 p-[26px_28px] transition-[background] duration-250",
                  result.cheapest === "gift" &&
                    "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--good)_9%,transparent),transparent_65%)]",
                )}
                id="route-gift"
              >
                {/* route-label */}
                <div className="text-ink-2 font-code flex items-center gap-2 text-[12px] tracking-[0.08em] uppercase">
                  <span>{t("steps.routes.gift.title")}</span>
                  {result.cheapest === "gift" && (
                    <span className="bg-good rounded-[5px] px-1.75 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#06140c]">
                      {t("steps.comparison.cheapest")}
                    </span>
                  )}
                </div>
                {/* route-amount */}
                <div
                  className={cn(
                    "font-code mt-2 text-[32px] font-bold tracking-[-0.02em]",
                    result.cheapest === "gift" ? "text-good" : "text-ink",
                  )}
                >
                  {result.gift?.totalCostVnd != null ? fmt(result.gift.totalCostVnd) : "—"}
                </div>
                {/* route-detail */}
                {result.gift && (
                  <div className="mt-3 flex flex-col gap-1.25">
                    {(
                      [
                        [t("steps.routes.gift.rate"), `× ${result.gift.rate}`],
                        [t("steps.routes.gift.steamPrice"), fmt(displayedGame.priceVnd)],
                        [t("steps.routes.gift.charges"), fmt(result.gift.totalCostVnd)],
                      ] as [string, string][]
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="text-ink-3 flex items-baseline justify-between gap-3 text-[12.5px]"
                      >
                        <span>{label}</span>
                        <span className="font-code shrink-0">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* VS divider */}
              <div className="relative grid place-items-center px-1.5 max-[920px]:px-0 max-[920px]:py-1.5">
                <div className="bg-line absolute top-3.5 bottom-[calc(50%+26px)] left-1/2 w-px -translate-x-1/2 max-[920px]:hidden" />
                <span className="font-heading text-ink-3 border-line bg-card-bg relative z-1 grid h-10.5 w-10.5 place-items-center rounded-full border text-[13px] font-bold">
                  VS
                </span>
                <div className="bg-line absolute top-[calc(50%+26px)] bottom-3.5 left-1/2 w-px -translate-x-1/2 max-[920px]:hidden" />
                <div className="bg-line absolute top-1/2 left-3.5 right-[calc(50%+30px)] hidden h-px -translate-y-1/2 max-[920px]:block" />
                <div className="bg-line absolute top-1/2 left-[calc(50%+30px)] right-3.5 hidden h-px -translate-y-1/2 max-[920px]:block" />
              </div>

              {/* TF2 route */}
              <div
                className={cn(
                  "flex flex-col gap-1 p-[26px_28px] transition-[background] duration-250",
                  result.cheapest === "tf" &&
                    "bg-[linear-gradient(215deg,color-mix(in_oklab,var(--good)_9%,transparent),transparent_65%)]",
                )}
                id="route-key"
              >
                {/* route-label */}
                <div className="text-ink-2 font-code flex items-center gap-2 text-[12px] tracking-[0.08em] uppercase">
                  <span>{t("steps.routes.tf.title")}</span>
                  {result.cheapest === "tf" && (
                    <span className="bg-good rounded-[5px] px-1.75 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#06140c]">
                      {t("steps.comparison.cheapest")}
                    </span>
                  )}
                </div>
                {/* route-amount */}
                <div
                  className={cn(
                    "font-code mt-2 text-[32px] font-bold tracking-[-0.02em]",
                    result.cheapest === "tf" ? "text-good" : "text-ink",
                  )}
                >
                  {fmt(result.tf.effectiveCostVnd)}
                </div>
                {/* route-detail */}
                <div className="mt-3 flex flex-col gap-1.25">
                  {(
                    [
                      [t("steps.routes.tf.keysNeeded"), String(result.tf.keysNeeded)],
                      [t("steps.routes.tf.netPerKey"), fmt(result.tf.netPerKeyVnd)],
                      [t("steps.routes.tf.cashPaid"), fmt(result.tf.cashPaidVnd)],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="text-ink-3 flex items-baseline justify-between gap-3 text-[12.5px]"
                    >
                      <span>{label}</span>
                      <span className="font-code shrink-0">{value}</span>
                    </div>
                  ))}
                  <div className="text-ink border-line-soft mt-1 flex items-baseline justify-between gap-3 border-t pt-1.5 text-[12.5px] font-bold">
                    <span>{t("steps.routes.tf.walletAfter")}</span>
                    <span className="font-code shrink-0">
                      {fmt(result.tf.walletAfterPurchaseVnd)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* savings-bar */}
            {result.gift && result.cheapest !== "tie"
              ? (() => {
                  const giftCost = result.gift.totalCostVnd ?? 0;
                  const tfCost = result.tf.effectiveCostVnd;
                  const winnerCost = result.cheapest === "gift" ? giftCost : tfCost;
                  const loserCost = result.cheapest === "gift" ? tfCost : giftCost;
                  const saving = loserCost - winnerCost;
                  const pct = loserCost > 0 ? ((saving / loserCost) * 100).toFixed(1) : "0";
                  const winnerLabel =
                    result.cheapest === "gift"
                      ? t("steps.comparison.giftMethod")
                      : t("steps.comparison.tfMethod");
                  const loserLabel =
                    result.cheapest === "gift"
                      ? t("steps.comparison.tfMethod")
                      : t("steps.comparison.giftMethod");
                  return (
                    <div className="border-line-soft flex flex-wrap items-center justify-between gap-4 border-t bg-black/18 px-7 py-4">
                      <p className="text-ink-2 [&_strong]:text-good [&_strong]:font-code text-[13.5px]">
                        {locale === "vi" ? (
                          <>
                            {winnerLabel} tiết kiệm{" "}
                            <strong>
                              {fmt(saving)} ({pct}%)
                            </strong>{" "}
                            so với {loserLabel}.
                          </>
                        ) : (
                          <>
                            {winnerLabel} saves{" "}
                            <strong>
                              {fmt(saving)} ({pct}%)
                            </strong>{" "}
                            vs {loserLabel}.
                          </>
                        )}
                      </p>
                    </div>
                  );
                })()
              : null}
          </section>
        ) : null}

        {cartEntries.length > 0 ? (
          <CartCard
            entries={cartEntries}
            onRemove={removeFromCart}
            onReorder={reorderCart}
            onSelect={(entry) => {
              const keys = entry.kind === "app" ? entry.items.map((i) => i.key) : [];
              const mode: "single" | "multi" = keys.length > 1 ? "multi" : "single";
              loadItem({ kind: entry.kind, id: entry.appid }, undefined, keys, mode);
              const target = document.getElementById("game-info");
              if (!target) return;
              import("gsap").then(async ({ gsap }) => {
                const { ScrollToPlugin } = await import("gsap/ScrollToPlugin");
                gsap.registerPlugin(ScrollToPlugin);
                gsap.to(window, {
                  duration: 0.85,
                  scrollTo: { y: target, offsetY: 24 },
                  ease: "power3.inOut",
                });
              });
            }}
            onClear={clearCart}
            keyPriceVnd={keyQuery.data?.lowestPriceVnd ?? null}
            feePercent={effectiveFee}
            keyBuyPrice={effectiveKeyBuy}
            giftRate={effectiveGiftRate}
            vndPerUsd={usdRate}
            showUsd={showUsd}
          />
        ) : null}
      </main>

      <footer className="border-line-soft text-ink-3 mt-17.5 mb-10 flex flex-wrap items-center justify-between gap-2.5 border-t pt-6 text-[12.5px]">
        <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
        <span className="font-code text-[11.5px]">
          {locale === "vi"
            ? "Giá tham khảo — không phải lời khuyên tài chính."
            : "Reference prices — not financial advice."}
        </span>
      </footer>
    </div>
  );
}

function BannerImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={460}
      height={215}
      sizes="(max-width: 768px) 100vw, 460px"
      className="block h-auto w-full"
      priority
      onError={() => setFailed(true)}
    />
  );
}

function GameSummary({
  query,
  displayed,
  steamUrl,
  hasSelection,
  format,
}: {
  query: ReturnType<typeof useQuery<GamePriceResult>>;
  displayed: GamePriceResult | null;
  steamUrl: string | null;
  hasSelection: boolean;
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (query.isPending && !query.data && !query.error) {
    return (
      <div className="space-y-4">
        <div className="border-line-soft mt-4 min-h-35.75 w-full overflow-hidden rounded-[12px] border">
          <div
            className="text-ink-3 font-code bg-stripe flex h-full aspect-616/353 w-full items-center justify-center text-[11px] tracking-widest uppercase"
          >
            {locale === "vi" ? "ẢNH BÌA GAME — TỰ ĐỘNG TẢI" : "GAME COVER — AUTO LOADING"}
          </div>
        </div>
        <p className="text-ink-3 mt-4 text-[13px]">{t("steps.summary.empty")}</p>
      </div>
    );
  }
  if (query.isFetching && !displayed) {
    return (
      <div className="space-y-4">
        <div className="border-line-soft mt-4 aspect-460/215 overflow-hidden rounded-[12px] border">
          <div
            className="text-ink-3 font-code bg-stripe flex h-full w-full items-center justify-center gap-2.5 text-[11px] tracking-widest uppercase"
          >
            <Loader2 size={14} className="animate-[spin_0.7s_linear_infinite]" />
          </div>
        </div>
      </div>
    );
  }
  if (query.error) {
    const friendly =
      query.error instanceof GameFetchError && query.error.status === 502
        ? t("steps.game.invalidUrl")
        : query.error instanceof Error
          ? query.error.message
          : t("errors.loadFailed");
    return <p className="mt-4 text-[13px] text-[#f87171]">{friendly}</p>;
  }
  const g = displayed;
  if (!g) return null;

  const coverLabel = locale === "vi" ? "ẢNH BÌA GAME — TỰ ĐỘNG TẢI" : "GAME COVER — AUTO LOADING";
  const banner = (
    <div className="border-line-soft mt-4 w-full overflow-hidden rounded-[12px] border">
      {g.imageUrl ? (
        <BannerImage key={g.imageUrl} src={g.imageUrl} alt={g.name} />
      ) : (
        <div
          className="text-ink-3 font-code bg-stripe flex min-h-35.75 w-full items-center justify-center gap-2.5 text-[11px] tracking-widest uppercase"
        >
          {coverLabel}
        </div>
      )}
    </div>
  );

  const titleRow = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <strong className="font-heading text-ink line-clamp-2 min-w-0 text-[22px] font-bold tracking-[-0.01em]">
          {g.name}
        </strong>
        {steamUrl ? (
          <a
            href={steamUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ink-3 hover:text-ink inline-flex shrink-0 items-center gap-1 text-[12px] transition-colors duration-150"
          >
            {t("steps.summary.openInSteam")} <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          `${g.kind}/${g.appid}`,
          locale === "vi" ? "Khu vực: VN" : "Region: VN",
          ...g.genres.slice(0, 3),
        ].map((tag) => (
          <span
            key={tag}
            className="font-code text-ink-2 border-line-soft rounded-[6px] border bg-white/4.5 px-2 py-0.75 text-[11px]"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );

  if (g.priceVnd != null && g.priceVnd > 0) {
    // fall through to the priced branch below
  } else if (g.isFree && hasSelection) {
    return (
      <div className="space-y-4">
        {banner}
        {titleRow}
        <p className="text-ink-2 mt-2 text-[13px]">
          {t.rich("steps.summary.freeToPlay", {
            name: g.name,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  } else if (g.priceVnd == null) {
    const nothingToSelect = g.editions.length === 0 && g.dlcAppIds.length === 0;
    return (
      <div className="space-y-4">
        {banner}
        {titleRow}
        <p className="text-ink-3 mt-2 text-[13px]">
          {hasSelection
            ? t.rich("steps.summary.noRegionPrice", {
                name: g.name,
                b: (chunks) => <strong>{chunks}</strong>,
              })
            : nothingToSelect
              ? t("steps.summary.unavailable")
              : t("steps.summary.selectVersion")}
        </p>
      </div>
    );
  }

  const useUsdSide = g.priceUsd != null;
  const dPct = useUsdSide ? g.discountPercentUsd : g.discountPercent;
  const hasDiscount =
    dPct > 0 && (useUsdSide ? g.initialPriceUsd != null : g.initialPriceVnd != null);

  return (
    <div className="space-y-4">
      {banner}
      {titleRow}
      <div className="mt-4 flex items-baseline gap-2.5">
        <span className="font-code text-ink text-[22px] font-bold tracking-[-0.02em] sm:text-[30px]">
          {format(g.priceVnd, g.priceUsd)}
        </span>
        {hasDiscount ? (
          <>
            <span className="text-ink-3 text-[13px] line-through">
              {format(g.initialPriceVnd, g.initialPriceUsd)}
            </span>
            <span
              className="font-code text-good bg-good-bg rounded-[6px] px-2 py-0.75 text-[12px] font-bold"
            >
              −{dPct}%
            </span>
          </>
        ) : null}
        <span className="text-ink-3 text-[12px]">{t("steps.summary.description")}</span>
      </div>
      {g.releaseDate ? (
        <p className="text-ink-3 mt-1.5 text-[11px]">
          {t("steps.summary.released", {
            date: formatReleaseDate(g.releaseDate, locale) ?? g.releaseDate,
          })}
        </p>
      ) : null}
    </div>
  );
}

function KeySummary({
  query,
  format,
}: {
  query: ReturnType<typeof useQuery<KeyPriceResult>>;
  format: (v: number | null | undefined) => string;
}) {
  const t = useTranslations();

  if (query.isFetching && !query.data) {
    return (
      <p className="text-ink-3 mt-4.5 flex items-center gap-2 text-[13px]">
        <Loader2 size={14} className="animate-[spin_0.7s_linear_infinite]" />{" "}
        {t("steps.key.loading")}
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="mt-4.5 text-[13px] text-[#f87171]">
        {query.error instanceof Error ? query.error.message : t("errors.loadFailed")}
      </p>
    );
  }
  const k = query.data;
  if (!k) return null;

  return (
    <>
      <div className="mt-4.5 flex items-baseline gap-2.5">
        <span
          className="font-code text-[34px] font-bold tracking-[-0.02em] text-hi-text-bright text-shadow-glow"
        >
          {format(k.lowestPriceVnd)}
        </span>
        <span className="text-ink-3 text-[12px]">{t("steps.key.lowest")}</span>
      </div>
      <a
        href="https://steamcommunity.com/market/listings/440/Mann%20Co.%20Supply%20Crate%20Key"
        target="_blank"
        rel="noreferrer"
        className="text-ink-3 hover:text-hi mt-1 inline-flex items-center gap-1 text-[11.5px] no-underline transition-colors duration-150"
      >
        {t("steps.key.viewOnMarket")} <ExternalLink size={11} aria-hidden />
      </a>
      <div className="border-line-soft mt-3.5 flex gap-5.5 border-t pt-3.5">
        <div>
          <div className="text-ink-3 font-code text-[11px] tracking-[0.07em] uppercase">
            {t("steps.key.median", { value: "" }).replace(/ $/, "")}
          </div>
          <div className="font-code text-ink mt-0.75 text-[14px]">{format(k.medianPriceVnd)}</div>
        </div>
        <div>
          <div className="text-ink-3 font-code text-[11px] tracking-[0.07em] uppercase">
            {t("steps.key.volume", { value: "" }).replace(/ $/, "")}
          </div>
          <div className="font-code text-ink mt-0.75 text-[14px]">{k.volume ?? "—"}</div>
        </div>
        <div>
          <div className="text-ink-3 font-code text-[10px] tracking-[0.07em] uppercase">
            {t("steps.routes.tf.netPerKey")}
          </div>
          <div className="font-code text-ink mt-0.75 text-[14px]">
            {format(k.lowestPriceVnd ? Math.round(k.lowestPriceVnd * (1 - 0.13)) : null)}
          </div>
        </div>
      </div>
    </>
  );
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function labelForSelectedItem(item: SelectedItem, rootName: string): string {
  if (item.kind === "dlc") return item.name || rootName;
  if (!item.name) return rootName;
  const name = item.name.toLowerCase();
  const root = rootName.toLowerCase();
  if (root.startsWith(name)) return rootName;
  if (name.startsWith(root)) return item.name;
  return `${rootName} ${item.name}`;
}

function SearchResultsPopover({
  query,
  previewQuery,
  previewItem,
  hasSearchTerm,
  history,
  format,
  onPick,
  onRemoveHistory,
}: {
  query: ReturnType<typeof useQuery<SearchResult[]>>;
  previewQuery: ReturnType<typeof useQuery<GamePriceResult>>;
  previewItem: SteamItemRef | null;
  hasSearchTerm: boolean;
  history: HistoryEntry[];
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
  onPick: (ref: SteamItemRef) => void;
  onRemoveHistory: (appid: number) => void;
}) {
  const t = useTranslations("steps.game");

  if (previewItem != null) {
    if (previewQuery.isFetching && !previewQuery.data) {
      return (
        <div className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 rounded-md border p-3 text-sm shadow-md">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> {t("searching")}
          </div>
        </div>
      );
    }
    if (previewQuery.error || !previewQuery.data) {
      const err = previewQuery.error;
      const isInvalid = err instanceof GameFetchError && err.status === 502;
      return (
        <div className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 rounded-md border p-3 text-sm shadow-md">
          <p className="text-destructive">
            {isInvalid ? t("invalidUrl") : err instanceof Error ? err.message : t("invalidUrl")}
          </p>
        </div>
      );
    }
    const g = previewQuery.data;
    return (
      <ul className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 max-h-96 overflow-auto rounded-md border py-1 text-sm shadow-md">
        <li className="text-muted-foreground px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide uppercase">
          {t("previewHeading")}
        </li>
        <li>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick({ kind: previewItem.kind, id: g.appid })}
            className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors"
          >
            {g.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={g.imageUrl}
                alt=""
                width={64}
                height={24}
                className="h-6 w-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-muted h-6 w-16 shrink-0 rounded" />
            )}
            <span className="flex-1 truncate">{g.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {g.priceVnd != null ? format(g.priceVnd, g.priceUsd) : ""}
            </span>
          </button>
        </li>
      </ul>
    );
  }

  if (!hasSearchTerm) {
    if (history.length === 0) return null;
    return (
      <ul className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 max-h-96 overflow-auto rounded-md border py-1 text-sm shadow-md">
        <li className="text-muted-foreground px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide uppercase">
          {t("historyHeading")}
        </li>
        {history.map((h) => (
          <li key={h.appid} className="group relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick({ kind: "app", id: h.appid })}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 px-2 py-1.5 pr-9 text-left transition-colors"
            >
              {h.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.image.replace(/capsule_616x353\.jpg(\?.*)?$/, "header.jpg")}
                  alt=""
                  width={60}
                  height={23}
                  className="h-6 w-15 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="bg-muted h-6 w-15 shrink-0 rounded" />
              )}
              <span className="flex-1 truncate">{h.name}</span>
            </button>
            <button
              type="button"
              aria-label={t("historyRemove")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveHistory(h.appid);
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isFetching && !query.data) {
    return (
      <div className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 rounded-md border p-3 text-sm shadow-md">
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> {t("searching")}
        </div>
      </div>
    );
  }
  const results = query.data ?? [];
  if (results.length === 0) {
    return (
      <div className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 rounded-md border p-3 text-sm shadow-md">
        <div className="text-muted-foreground flex items-center gap-2">
          <Search className="size-4" /> {t("noResults")}
        </div>
      </div>
    );
  }
  return (
    <ul className="bg-popover absolute top-full right-0 left-0 z-30 mt-2 max-h-96 overflow-auto rounded-md border py-1 text-sm shadow-md">
      {results.map((r) => (
        <li key={r.appid}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick({ kind: "app", id: r.appid })}
            className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors"
          >
            {r.tinyImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.tinyImage}
                alt=""
                width={64}
                height={24}
                className="h-6 w-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-muted h-6 w-16 shrink-0 rounded" />
            )}
            <span className="flex-1 truncate">{r.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {r.priceVnd != null ? format(r.priceVnd, null) : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
