"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useQueries, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ExternalLink, Loader2, RefreshCw, Search, X } from "lucide-react";

import { LocaleToggle } from "@/components/locale-toggle";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VersionsCard, type SelectedItem } from "@/components/versions-card";
import { calculate, formatReleaseDate, formatUsd, formatUsdNative, formatVnd } from "@/lib/calc";
import { useSearchHistory, type HistoryEntry } from "@/lib/history";
import {
  extractAppId,
  type GamePriceResult,
  type KeyPriceResult,
  type SearchResult,
} from "@/lib/steam";
import { cn } from "@/lib/utils";
import { Backlight } from "./ui/backlight";

// Steam's effective fee on TF2 keys ≈ 13% in VN region (list 65k → wallet ~56.5k).
const DEFAULT_FEE = 13;
const DEFAULT_GIFT_RATE = 0.8;
// Typical VN trader rate per TF2 key in cash. Tracks the Steam Market price
// roughly but the user can adjust as it fluctuates.
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

async function fetchGame(appid: number): Promise<GamePriceResult> {
  try {
    const { data } = await axios.get<GamePriceResult>(`/api/game/${appid}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const message = (err.response.data as { error?: string } | undefined)?.error ?? err.message;
      throw new GameFetchError(message, err.response.status);
    }
    throw err;
  }
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
  const [urlInput, setUrlInput] = useState("");
  const [rootAppId, setRootAppId] = useState<number | null>(null);
  // Multi-select: each entry is "pkg-{packageid}" or "dlc-{appid}". Order
  // matters for display (first selected drives the highlight).
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"single" | "multi">("single");

  const [feePercent, setFeePercent] = useState<string>(String(DEFAULT_FEE));
  const [keyBuyPrice, setKeyBuyPrice] = useState<string>(String(DEFAULT_KEY_BUY_PRICE));
  const [giftRate, setGiftRate] = useState<string>(String(DEFAULT_GIFT_RATE));

  const [showUsd, setShowUsd] = useState(false);
  const [vndPerUsd, setVndPerUsd] = useState<string>(String(DEFAULT_VND_PER_USD));
  const userTouchedRateRef = useRef(false);

  const { history, addEntry: addToHistory, removeEntry: removeFromHistory } = useSearchHistory();

  // Pull the live VND/USD rate once on mount and seed the input unless the
  // user has already typed their own value.
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

  const parsedAppIdFromInput = extractAppId(urlInput);

  // When the user types a non-URL/id, treat as a Steam search query.
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(urlInput, 300);
  const hasSearchTerm = debouncedQuery.trim().length >= 2;
  const isSearchable = !parsedAppIdFromInput && hasSearchTerm && searchOpen;
  const searchQuery = useQuery({
    queryKey: ["search", debouncedQuery.trim()],
    queryFn: () => fetchSearch(debouncedQuery.trim()),
    enabled: isSearchable,
    staleTime: 5 * 60 * 1000,
  });

  // When the input is a URL/appid, fetch a preview so the dropdown can show a
  // single confirmation row before the user submits.
  const previewQuery = useQuery({
    queryKey: ["game", parsedAppIdFromInput],
    queryFn: () => fetchGame(parsedAppIdFromInput!),
    enabled: parsedAppIdFromInput != null && searchOpen,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // The popover shows: search results, URL preview, or recent history.
  const showPopover =
    searchOpen && (parsedAppIdFromInput != null || hasSearchTerm || history.length > 0);

  const rootGameQuery = useQuery({
    queryKey: ["game", rootAppId],
    queryFn: () => fetchGame(rootAppId!),
    enabled: rootAppId != null,
  });

  // Push the root game into history once its details arrive — works for both
  // URL submits and search-picked games.
  const loadedAppId = rootGameQuery.data?.appid ?? null;
  const loadedName = rootGameQuery.data?.name;
  const loadedImage = rootGameQuery.data?.imageUrl;
  useEffect(() => {
    if (loadedAppId == null || !loadedName) return;
    addToHistory({ appid: loadedAppId, name: loadedName, image: loadedImage ?? null });
  }, [loadedAppId, loadedName, loadedImage, addToHistory]);

  // Auto-pre-select the base edition whenever a fresh root game finishes
  // loading, so the user starts with a meaningful price in the comparison.
  const firstEditionKey = rootGameQuery.data?.editions[0]?.packageid;
  useEffect(() => {
    if (firstEditionKey != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKeys([`pkg-${firstEditionKey}`]);
    }
  }, [firstEditionKey]);

  // Fetch DLC details for each currently-selected DLC so we can sum prices.
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

  // Resolve each selected key into a SelectedItem with name + pricing. Items
  // whose data is still loading or missing are kept as null and excluded from
  // totals.
  const selectedItems: SelectedItem[] = selectedKeys
    .map((key): SelectedItem | null => {
      if (key.startsWith("pkg-")) {
        const id = Number(key.slice(4));
        const edition = rootGameQuery.data?.editions.find((e) => e.packageid === id);
        if (!edition || !rootGameQuery.data) return null;
        return {
          key,
          kind: "package",
          // Packages share the root app's store page + release date.
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

  const totalVnd = selectedItems.reduce((sum, i) => sum + (i.priceVnd ?? 0), 0) || null;
  const totalUsd = selectedItems.every((i) => i.priceUsd != null)
    ? selectedItems.reduce((sum, i) => sum + (i.priceUsd ?? 0), 0)
    : null;

  // Single-selection: use that item's own banner + name (so the Game card
  // matches what's shown in the Versions dropdown trigger).
  // Multi-selection (or empty): fall back to the root game's banner + name.
  const rootName = rootGameQuery.data?.name ?? "";
  const displayedImageUrl =
    selectedItems.length === 1
      ? (selectedItems[0].imageUrl ?? rootGameQuery.data?.imageUrl ?? null)
      : (rootGameQuery.data?.imageUrl ?? null);
  const displayedName =
    selectedItems.length === 1
      ? labelForSelectedItem(selectedItems[0], rootName)
      : rootName;

  // For single-selection: route appid + release date through that item so the
  // Steam link points to its page (DLC → DLC page) and the displayed release
  // date matches Steam's actual page. Editions (packages) keep root values.
  const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null;

  const displayedGame: GamePriceResult | null = rootGameQuery.data
    ? {
        ...rootGameQuery.data,
        appid: singleSelected?.appid ?? rootGameQuery.data.appid,
        name: displayedName,
        imageUrl: displayedImageUrl,
        releaseDate: singleSelected?.releaseDate ?? rootGameQuery.data.releaseDate,
        priceVnd: totalVnd,
        initialPriceVnd: null,
        discountPercent: 0,
        priceUsd: totalUsd,
        initialPriceUsd: null,
        discountPercentUsd: 0,
        formatted: null,
      }
    : null;

  const displayedSteamUrl = displayedGame
    ? `https://store.steampowered.com/app/${displayedGame.appid}/`
    : null;

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

  const loadGame = (appid: number, urlIfKnown?: string) => {
    setRootAppId(appid);
    // Clear selection; auto-select effect re-picks the base edition when the
    // new root data arrives.
    setSelectedKeys([]);
    setUrlInput(urlIfKnown ?? `https://store.steampowered.com/app/${appid}/`);
    setSearchOpen(false);
  };

  // Switching modes:
  //   single → multi  : keep current selection (already ≤1 item).
  //   multi  → single : if >1 selected, reset to just the base edition.
  const onSelectionModeChange = (mode: "single" | "multi") => {
    setSelectionMode(mode);
    if (mode === "single" && selectedKeys.length > 1) {
      const baseKey = firstEditionKey != null ? `pkg-${firstEditionKey}` : null;
      setSelectedKeys(baseKey ? [baseKey] : []);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAppIdFromInput) loadGame(parsedAppIdFromInput, urlInput);
  };

  const fmt = (v: number | null | undefined) =>
    showUsd ? formatUsd(v ?? null, usdRate) : formatVnd(v ?? null);

  // Format a price pair where the USD amount is already known natively from
  // Steam (game prices, edition prices). Avoids the VND→USD conversion that
  // `fmt` would otherwise do.
  const fmtPair = (vnd: number | null | undefined, usd: number | null | undefined) => {
    if (showUsd) {
      // Prefer the native USD value; fall back to converting from VND.
      return usd != null ? formatUsdNative(usd) : formatUsd(vnd ?? null, usdRate);
    }
    return formatVnd(vnd ?? null);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={150} height={150} className="text-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("header.title")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <AnimatedThemeToggler
              variant="circle"
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex size-9 items-center justify-center rounded-md transition-colors [&_svg]:size-4"
            />
            <LocaleToggle />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{t("header.subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("steps.game.title")}</CardTitle>
          <CardDescription>{t("steps.game.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  // Defer so a click on a result can register before we close.
                  setTimeout(() => setSearchOpen(false), 150);
                }}
                placeholder={t("steps.game.placeholder")}
                className={cn("font-mono", urlInput && "pr-8")}
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
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition-colors"
                >
                  <X className="size-4" />
                </button>
              ) : null}
              {showPopover ? (
                <SearchResultsPopover
                  query={searchQuery}
                  previewQuery={previewQuery}
                  previewAppId={parsedAppIdFromInput}
                  hasSearchTerm={hasSearchTerm}
                  history={history}
                  onPick={(appid) =>
                    loadGame(appid, `https://store.steampowered.com/app/${appid}/`)
                  }
                  onRemoveHistory={removeFromHistory}
                  format={fmtPair}
                />
              ) : null}
            </div>
            <Button type="submit" disabled={!parsedAppIdFromInput}>
              {rootGameQuery.isFetching ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRight aria-hidden />
              )}
              {t("steps.game.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t("steps.summary.title")}</CardTitle>
            <CardDescription>{t("steps.summary.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GameSummary
              query={displayedQuery}
              displayed={displayedGame}
              steamUrl={displayedSteamUrl}
              hasSelection={selectedKeys.length > 0}
              format={fmtPair}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6 lg:h-full">
          <Card className="lg:flex-1">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{t("steps.key.title")}</CardTitle>
                  <CardDescription>{t("steps.key.description")}</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => keyQuery.refetch()}
                  disabled={keyQuery.isFetching}
                  aria-label={t("steps.key.refresh")}
                >
                  {keyQuery.isFetching ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <KeySummary query={keyQuery} format={fmt} />
            </CardContent>
          </Card>

          <VersionsCard
            className="lg:flex-1"
            rootGame={rootGameQuery.data ?? null}
            selectedKeys={selectedKeys}
            onChange={setSelectedKeys}
            mode={selectionMode}
            onModeChange={onSelectionModeChange}
            format={fmtPair}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("steps.params.title")}</CardTitle>
          <CardDescription>{t("steps.params.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("steps.params.feeLabel")} hint={t("steps.params.feeHint")}>
              <Input
                inputMode="decimal"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
              />
            </Field>
            <Field label={t("steps.params.keyBuyLabel")} hint={t("steps.params.keyBuyHint")}>
              <Input
                inputMode="numeric"
                value={keyBuyPrice}
                onChange={(e) => setKeyBuyPrice(e.target.value)}
                placeholder={String(DEFAULT_KEY_BUY_PRICE)}
              />
            </Field>
            <Field label={t("steps.params.giftRateLabel")} hint={t("steps.params.giftRateHint")}>
              <Input
                inputMode="decimal"
                value={giftRate}
                onChange={(e) => setGiftRate(e.target.value)}
                placeholder="0.80"
              />
            </Field>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <Field
              label={t("steps.params.usdRateLabel")}
              hint={t("steps.params.usdRateHint")}
              className="sm:max-w-xs"
            >
              <Input
                inputMode="numeric"
                value={vndPerUsd}
                onChange={(e) => {
                  userTouchedRateRef.current = true;
                  setVndPerUsd(e.target.value);
                }}
              />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{t("currency.label")}</span>
              <span className={cn(!showUsd && "font-semibold")}>{t("currency.vnd")}</span>
              <Switch checked={showUsd} onCheckedChange={setShowUsd} />
              <span className={cn(showUsd && "font-semibold")}>{t("currency.usd")}</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {result && displayedGame?.priceVnd ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("steps.comparison.title")}</CardTitle>
            <CardDescription>
              {t.rich("steps.comparison.subtitle", {
                value: fmtPair(displayedGame.priceVnd, displayedGame.priceUsd),
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <RouteCard
                title={t("steps.routes.gift.title")}
                cheapestLabel={t("steps.comparison.cheapest")}
                cost={result.gift?.totalCostVnd ?? null}
                highlight={result.cheapest === "gift"}
                format={fmt}
                details={
                  result.gift
                    ? [
                        { label: t("steps.routes.gift.rate"), value: `× ${result.gift.rate}` },
                        {
                          label: t("steps.routes.gift.steamPrice"),
                          value: fmtPair(displayedGame.priceVnd, displayedGame.priceUsd),
                        },
                        {
                          label: t("steps.routes.gift.charges"),
                          value: fmt(result.gift.totalCostVnd),
                        },
                      ]
                    : [{ label: t("steps.routes.gift.rate"), value: t("steps.routes.gift.empty") }]
                }
              />
              <RouteCard
                title={t("steps.routes.tf.title")}
                cheapestLabel={t("steps.comparison.cheapest")}
                cost={result.tf.effectiveCostVnd}
                highlight={result.cheapest === "tf"}
                format={fmt}
                details={[
                  { label: t("steps.routes.tf.keysNeeded"), value: `${result.tf.keysNeeded}` },
                  { label: t("steps.routes.tf.netPerKey"), value: fmt(result.tf.netPerKeyVnd) },
                  { label: t("steps.routes.tf.cashPaid"), value: fmt(result.tf.cashPaidVnd) },
                  {
                    label: t("steps.routes.tf.walletAfter"),
                    value: fmt(result.tf.walletAfterPurchaseVnd),
                    bold: true,
                  },
                ]}
              />
            </div>
            {result.gift && result.savingsVsDirectVnd != null ? (
              <div className="bg-muted/40 mt-6 rounded-md border p-4 text-sm">
                {(() => {
                  const methodLabel =
                    result.cheapest === "tf"
                      ? t("steps.comparison.tfMethod")
                      : t("steps.comparison.giftMethod");
                  const key =
                    result.savingsVsDirectVnd > 0
                      ? "savingsVsDirect"
                      : result.savingsVsDirectVnd < 0
                        ? "loss"
                        : "evenWithDirect";
                  return (
                    <p>
                      {t.rich(`steps.comparison.${key}`, {
                        method: methodLabel,
                        amount: fmt(Math.abs(result.savingsVsDirectVnd)),
                        b: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </p>
                  );
                })()}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <footer className="text-muted-foreground mt-4 border-t pt-6 text-center text-xs">
        {t("footer.copyright", { year: new Date().getFullYear() })}
      </footer>
    </div>
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
    return <p className="text-muted-foreground text-sm">{t("steps.summary.empty")}</p>;
  }
  if (query.isFetching && !displayed) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t("steps.summary.loading")}
      </p>
    );
  }
  if (query.error) {
    const friendly =
      query.error instanceof GameFetchError && query.error.status === 502
        ? t("steps.game.invalidUrl")
        : query.error instanceof Error
          ? query.error.message
          : t("errors.loadFailed");
    return <p className="text-destructive text-sm">{friendly}</p>;
  }
  const g = displayed;
  if (!g) return null;

  const banner = g.imageUrl ? (
    <Backlight blur={10} className="w-full">
      <div className="bg-muted relative aspect-460/215 w-full overflow-hidden rounded-md">
        <Image
          src={g.imageUrl}
          alt={g.name}
          fill
          sizes="(max-width: 768px) 100vw, 600px"
          className="object-cover"
          priority
        />
      </div>
    </Backlight>
  ) : null;

  const titleRow = (
    <div className="flex items-center justify-between gap-2">
      <strong className="min-w-0 flex-1 truncate">{g.name}</strong>
      {steamUrl ? (
        <a
          href={steamUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs hover:underline"
        >
          {t("steps.summary.openInSteam")} <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );

  // Order matters: a positive price wins over everything — covers the case
  // where a free root game (e.g. CS2) has a paid DLC selected (Prime Status
  // Upgrade), so we show the DLC's price rather than the free-to-play hint.
  if (g.priceVnd != null && g.priceVnd > 0) {
    // fall through to the priced branch below
  } else if (g.isFree && hasSelection) {
    return (
      <div className="flex min-w-0 flex-col gap-3 text-sm">
        {banner}
        {titleRow}
        <p className="break-words">
          {t.rich("steps.summary.freeToPlay", {
            name: g.name,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  } else if (g.priceVnd == null) {
    // Three distinct null-price cases, ordered most-to-least specific:
    //   1. hasSelection — a selected item came back with no VN price (region-locked).
    //   2. no editions AND no DLC AND not free — nothing to select and no price
    //      (e.g. delisted titles like "Muse Dash - Just as planned").
    //   3. There are alternatives — user just hasn't picked one yet.
    const nothingToSelect = g.editions.length === 0 && g.dlcAppIds.length === 0;
    return (
      <div className="flex min-w-0 flex-col gap-3 text-sm">
        {banner}
        {titleRow}
        <p className="break-words text-muted-foreground">
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
  // Pick the region-appropriate discount (VND and US sales can differ).
  // The `format` callback already decides VND vs USD output, so we just need
  // to surface a strikethrough when *either* region has a discount on this
  // edition. We prefer the USD discount info when the USD price exists.
  const useUsdSide = g.priceUsd != null;
  const dPct = useUsdSide ? g.discountPercentUsd : g.discountPercent;
  const hasDiscount =
    dPct > 0 && (useUsdSide ? g.initialPriceUsd != null : g.initialPriceVnd != null);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {banner}
      {titleRow}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{format(g.priceVnd, g.priceUsd)}</span>
        {hasDiscount ? (
          <>
            <span className="text-muted-foreground text-sm line-through">
              {format(g.initialPriceVnd, g.initialPriceUsd)}
            </span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
              −{dPct}%
            </span>
          </>
        ) : null}
      </div>
      {g.releaseDate ? (
        <p className="text-muted-foreground text-xs">
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
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t("steps.key.loading")}
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-destructive text-sm">
        {query.error instanceof Error ? query.error.message : t("errors.loadFailed")}
      </p>
    );
  }
  const k = query.data;
  if (!k) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{format(k.lowestPriceVnd)}</span>
          <span className="text-muted-foreground text-xs">{t("steps.key.lowest")}</span>
        </div>
        <a
          href="https://steamcommunity.com/market/listings/440/Mann%20Co.%20Supply%20Crate%20Key"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs hover:underline"
        >
          {t("steps.summary.openInSteam")} <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("steps.key.median", { value: format(k.medianPriceVnd) })} ·{" "}
        {t("steps.key.volume", { value: k.volume ?? "—" })}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

type RouteDetail = { label: string; value: string; bold?: boolean };

function RouteCard({
  title,
  cheapestLabel,
  cost,
  highlight,
  details,
  format,
}: {
  title: string;
  cheapestLabel: string;
  cost: number | null;
  highlight: boolean;
  details: RouteDetail[];
  format: (v: number | null | undefined) => string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 transition-colors",
        highlight && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
        {highlight ? (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {cheapestLabel}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold">{cost != null ? format(cost) : "—"}</div>
      <dl className="text-muted-foreground grid gap-1 text-xs">
        {details.map(({ label, value, bold }) => (
          <div key={label} className="flex items-center justify-between">
            <dt className={cn(bold && "text-foreground font-bold")}>{label}</dt>
            <dd className={cn("text-foreground font-medium", bold && "font-bold")}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Pick the label shown in the Game card for a single selection so it matches
// the Versions dropdown trigger. Packages reuse the editionLabel-style rule
// (prefer the root name when it extends the edition name, e.g.
// "Subnautica 2" over "Subnautica"); DLCs use their own app name.
function labelForSelectedItem(item: SelectedItem, rootName: string): string {
  if (item.kind === "dlc") return item.name || rootName;
  if (!item.name) return rootName;
  if (rootName.toLowerCase().startsWith(item.name.toLowerCase())) return rootName;
  return item.name;
}

function SearchResultsPopover({
  query,
  previewQuery,
  previewAppId,
  hasSearchTerm,
  history,
  format,
  onPick,
  onRemoveHistory,
}: {
  query: ReturnType<typeof useQuery<SearchResult[]>>;
  previewQuery: ReturnType<typeof useQuery<GamePriceResult>>;
  previewAppId: number | null;
  hasSearchTerm: boolean;
  history: HistoryEntry[];
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
  onPick: (appid: number) => void;
  onRemoveHistory: (appid: number) => void;
}) {
  const t = useTranslations("steps.game");

  // Input looks like a Steam URL / appid → show a single preview row.
  if (previewAppId != null) {
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
            onClick={() => onPick(g.appid)}
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

  // No search term yet → show recent history.
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
              onClick={() => onPick(h.appid)}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 px-2 py-1.5 pr-9 text-left transition-colors"
            >
              {h.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.image}
                  alt=""
                  width={64}
                  height={24}
                  className="h-6 w-16 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="bg-muted h-6 w-16 shrink-0 rounded" />
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
            onClick={() => onPick(r.appid)}
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
