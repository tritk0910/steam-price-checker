"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useTranslations } from "next-intl";
import { ArrowRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { LocaleToggle } from "@/components/locale-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VersionsCard, type Variant } from "@/components/versions-card";
import { calculate, formatUsd, formatVnd } from "@/lib/calc";
import { extractAppId, type GamePriceResult, type KeyPriceResult } from "@/lib/steam";
import { cn } from "@/lib/utils";

const DEFAULT_FEE = 15;
const DEFAULT_GIFT_RATE = 0.78;
const DEFAULT_VND_PER_USD = 25_500;

async function fetchGame(appid: number): Promise<GamePriceResult> {
  const { data } = await axios.get<GamePriceResult>(`/api/game/${appid}`);
  return data;
}

async function fetchKey(): Promise<KeyPriceResult> {
  const { data } = await axios.get<KeyPriceResult>(`/api/tf2-key`);
  return data;
}

export function Calculator() {
  const t = useTranslations();
  const [urlInput, setUrlInput] = useState("");
  const [rootAppId, setRootAppId] = useState<number | null>(null);
  const [variant, setVariant] = useState<Variant>({ kind: "root" });

  const [keyBuyPrice, setKeyBuyPrice] = useState<string>("");
  const [feePercent, setFeePercent] = useState<string>(String(DEFAULT_FEE));
  const [giftRate, setGiftRate] = useState<string>(String(DEFAULT_GIFT_RATE));

  const [showUsd, setShowUsd] = useState(false);
  const [vndPerUsd, setVndPerUsd] = useState<string>(String(DEFAULT_VND_PER_USD));

  const parsedAppIdFromInput = extractAppId(urlInput);

  const rootGameQuery = useQuery({
    queryKey: ["game", rootAppId],
    queryFn: () => fetchGame(rootAppId!),
    enabled: rootAppId != null,
  });

  const dlcAppId = variant.kind === "dlc" ? variant.appid : null;
  const dlcGameQuery = useQuery({
    queryKey: ["game", dlcAppId],
    queryFn: () => fetchGame(dlcAppId!),
    enabled: dlcAppId != null,
  });

  const keyQuery = useQuery({
    queryKey: ["tf2-key"],
    queryFn: fetchKey,
  });

  // What the Game card displays.
  const displayedGame: GamePriceResult | null = (() => {
    if (variant.kind === "dlc") return dlcGameQuery.data ?? null;
    const root = rootGameQuery.data;
    if (!root) return null;
    if (variant.kind === "package") {
      return {
        ...root,
        name: `${root.name} — ${variant.name}`,
        priceVnd: variant.priceVnd,
        initialPriceVnd: variant.priceVnd,
        discountPercent: variant.discountPercent,
        formatted: null,
      };
    }
    return root;
  })();

  const displayedSteamUrl =
    variant.kind === "package"
      ? `https://store.steampowered.com/sub/${variant.packageid}/`
      : displayedGame
        ? `https://store.steampowered.com/app/${displayedGame.appid}/`
        : null;

  const displayedQuery = variant.kind === "dlc" ? dlcGameQuery : rootGameQuery;

  const marketKeyPrice = keyQuery.data?.lowestPriceVnd ?? null;
  const effectiveKeyBuy = parseNumber(keyBuyPrice) ?? marketKeyPrice ?? 0;
  const effectiveFee = parseNumber(feePercent) ?? DEFAULT_FEE;
  const effectiveGiftRate = parseNumber(giftRate);
  const usdRate = parseNumber(vndPerUsd) ?? DEFAULT_VND_PER_USD;

  const gamePriceVnd = displayedGame?.priceVnd ?? null;
  const result =
    gamePriceVnd && marketKeyPrice
      ? calculate({
          gamePriceVnd,
          keyListPriceVnd: marketKeyPrice,
          keyBuyPriceVnd: effectiveKeyBuy || marketKeyPrice,
          marketplaceFeePercent: effectiveFee,
          giftingRate: effectiveGiftRate,
        })
      : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAppIdFromInput) {
      setRootAppId(parsedAppIdFromInput);
      setVariant({ kind: "root" });
    }
  };

  const fmt = (v: number | null | undefined) =>
    showUsd ? formatUsd(v ?? null, usdRate) : formatVnd(v ?? null);


  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("header.title")}</h1>
          <LocaleToggle />
        </div>
        <p className="text-sm text-muted-foreground">{t("header.subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("steps.game.title")}</CardTitle>
          <CardDescription>{t("steps.game.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={t("steps.game.placeholder")}
              className="font-mono"
            />
            <Button type="submit" disabled={!parsedAppIdFromInput}>
              {rootGameQuery.isFetching ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRight aria-hidden />
              )}
              {t("steps.game.submit")}
            </Button>
          </form>
          {urlInput && !parsedAppIdFromInput ? (
            <p className="mt-2 text-xs text-destructive">{t("steps.game.invalid")}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("steps.summary.title")}</CardTitle>
            <CardDescription>{t("steps.summary.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GameSummary
              query={displayedQuery}
              displayed={displayedGame}
              steamUrl={displayedSteamUrl}
              format={fmt}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:h-full">
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
            variant={variant}
            onChange={setVariant}
            format={fmt}
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
            <Field
              label={t("steps.params.keyBuyLabel")}
              hint={
                marketKeyPrice != null
                  ? t("steps.params.keyBuyHintWithMarket", { value: formatVnd(marketKeyPrice) })
                  : t("steps.params.keyBuyHintDefault")
              }
            >
              <Input
                inputMode="numeric"
                value={keyBuyPrice}
                onChange={(e) => setKeyBuyPrice(e.target.value)}
                placeholder={marketKeyPrice != null ? marketKeyPrice.toLocaleString("vi-VN") : ""}
              />
            </Field>
            <Field label={t("steps.params.giftRateLabel")} hint={t("steps.params.giftRateHint")}>
              <Input
                inputMode="decimal"
                value={giftRate}
                onChange={(e) => setGiftRate(e.target.value)}
                placeholder="0.78"
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
                onChange={(e) => setVndPerUsd(e.target.value)}
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
                value: fmt(displayedGame.priceVnd),
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
                        [t("steps.routes.gift.rate"), `× ${result.gift.rate}`],
                        [t("steps.routes.gift.steamPrice"), fmt(displayedGame.priceVnd)],
                        [t("steps.routes.gift.charges"), fmt(result.gift.totalCostVnd)],
                      ]
                    : [[t("steps.routes.gift.rate"), t("steps.routes.gift.empty")]]
                }
              />
              <RouteCard
                title={t("steps.routes.tf.title")}
                cheapestLabel={t("steps.comparison.cheapest")}
                cost={result.tf.effectiveCostVnd}
                highlight={result.cheapest === "tf"}
                format={fmt}
                details={[
                  [t("steps.routes.tf.keysNeeded"), `${result.tf.keysNeeded}`],
                  [t("steps.routes.tf.netPerKey"), fmt(result.tf.netPerKeyVnd)],
                  [t("steps.routes.tf.cashPaid"), fmt(result.tf.cashPaidVnd)],
                  [t("steps.routes.tf.surplus"), fmt(result.tf.surplusWalletVnd)],
                ]}
              />
            </div>
            {result.gift && result.savingsVnd != null ? (
              <div className="mt-6 rounded-md border bg-muted/40 p-4 text-sm">
                {result.cheapest === "tie" ? (
                  <p>{t("steps.comparison.tie")}</p>
                ) : (
                  <p>
                    {t.rich("steps.comparison.savings", {
                      method:
                        result.cheapest === "tf"
                          ? t("steps.comparison.tfMethod")
                          : t("steps.comparison.giftMethod"),
                      amount: fmt(result.savingsVnd),
                      b: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function GameSummary({
  query,
  displayed,
  steamUrl,
  format,
}: {
  query: ReturnType<typeof useQuery<GamePriceResult>>;
  displayed: GamePriceResult | null;
  steamUrl: string | null;
  format: (v: number | null | undefined) => string;
}) {
  const t = useTranslations();

  if (query.isPending && !query.data && !query.error) {
    return <p className="text-sm text-muted-foreground">{t("steps.summary.empty")}</p>;
  }
  if (query.isFetching && !displayed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("steps.summary.loading")}
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : t("errors.loadFailed")}
      </p>
    );
  }
  const g = displayed;
  if (!g) return null;

  const banner = g.imageUrl ? (
    <div className="relative aspect-460/215 w-full overflow-hidden rounded-md border bg-muted">
      <Image
        src={g.imageUrl}
        alt={g.name}
        fill
        sizes="(max-width: 768px) 100vw, 600px"
        className="object-cover"
        priority
      />
    </div>
  ) : null;

  const titleRow = (
    <div className="flex items-center justify-between gap-2">
      <strong className="truncate">{g.name}</strong>
      {steamUrl ? (
        <a
          href={steamUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          {t("steps.summary.openInSteam")} <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );

  if (g.isFree) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        {banner}
        {titleRow}
        <p>
          {t.rich("steps.summary.freeToPlay", {
            name: g.name,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  }
  if (g.priceVnd == null) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        {banner}
        {titleRow}
        <p className="text-muted-foreground">
          {t.rich("steps.summary.noRegionPrice", {
            name: g.name,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {banner}
      {titleRow}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{format(g.priceVnd)}</span>
        {g.discountPercent > 0 && g.initialPriceVnd ? (
          <>
            <span className="text-sm text-muted-foreground line-through">
              {format(g.initialPriceVnd)}
            </span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
              −{g.discountPercent}%
            </span>
          </>
        ) : null}
      </div>
      {g.releaseDate ? (
        <p className="text-xs text-muted-foreground">
          {t("steps.summary.released", { date: g.releaseDate })}
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("steps.key.loading")}
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : t("errors.loadFailed")}
      </p>
    );
  }
  const k = query.data;
  if (!k) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{format(k.lowestPriceVnd)}</span>
        <span className="text-xs text-muted-foreground">{t("steps.key.lowest")}</span>
      </div>
      <p className="text-xs text-muted-foreground">
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
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

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
  details: [string, string][];
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
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {highlight ? (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {cheapestLabel}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold">{cost != null ? format(cost) : "—"}</div>
      <dl className="grid gap-1 text-xs text-muted-foreground">
        {details.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <dt>{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
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
