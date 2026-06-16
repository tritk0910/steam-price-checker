"use client";

import axios from "axios";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Edition, GamePriceResult } from "@/lib/steam";

// What the parent renders for the Game card / comparison from a selection.
export type SelectedItem = {
  key: string;
  kind: "package" | "dlc";
  // Which Steam app this selection points to. For packages this is the root
  // app (packages live on the root's store page); for DLCs this is the DLC's
  // own appid (so links resolve to the DLC's page).
  appid: number;
  name: string;
  imageUrl: string | null;
  releaseDate: string | null;
  priceVnd: number | null;
  originalPriceVnd: number | null;
  discountPercent: number;
  priceUsd: number | null;
  originalPriceUsd: number | null;
  discountPercentUsd: number;
};

const EMPTY_DLC_IDS: number[] = [];
const EMPTY_BUNDLE_IDS: number[] = [];

async function fetchGame(appid: number): Promise<GamePriceResult> {
  const { data } = await axios.get<GamePriceResult>(`/api/game/${appid}`);
  return data;
}

export type SelectionMode = "single" | "multi";

export function VersionsCard({
  rootGame,
  selectedKeys,
  onChange,
  mode,
  onModeChange,
  format,
  className,
  noCard,
}: {
  rootGame: GamePriceResult | null;
  selectedKeys: string[];
  onChange: (next: string[]) => void;
  mode: SelectionMode;
  onModeChange: (next: SelectionMode) => void;
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
  className?: string;
  noCard?: boolean;
}) {
  const t = useTranslations("steps.versions");
  const [open, setOpen] = useState(false);

  // Hooks must be called unconditionally — pass an empty list when no game is
  // loaded. Queries are lazy: they fire when the user opens the popover (so
  // we can list DLC names + prices) and stay enabled while items are selected.
  const isBundle = rootGame?.kind === "bundle";
  const dlcIds = rootGame?.dlcAppIds ?? EMPTY_DLC_IDS;
  const bundleIds = rootGame?.bundleAppIds ?? EMPTY_BUNDLE_IDS;
  const selectedSet = new Set(selectedKeys);
  const dlcQueries = useQueries({
    queries: dlcIds.map((id) => ({
      queryKey: ["game", id],
      queryFn: () => fetchGame(id),
      enabled: rootGame != null && (open || selectedSet.has(`dlc-${id}`)),
      staleTime: 5 * 60 * 1000,
    })),
  });
  // Bundle contents are always fetched on open so users see real names. No
  // selection happens, so we don't keep them enabled when the popover closes.
  const bundleQueries = useQueries({
    queries: bundleIds.map((id) => ({
      queryKey: ["game", id],
      queryFn: () => fetchGame(id),
      enabled: rootGame != null && open,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const toggle = (key: string) => {
    if (mode === "single") {
      // Radio-style: clicking always sets the selection to just that key. We
      // don't allow unselecting the only item — at least one stays picked.
      onChange([key]);
      return;
    }
    if (selectedSet.has(key)) {
      onChange(selectedKeys.filter((k) => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  const hasGame = rootGame != null;
  const showEditions = hasGame && rootGame.editions.length > 0;
  const showDlc = hasGame && rootGame.dlcAppIds.length > 0;
  const showBundleContents = hasGame && isBundle && rootGame.bundleAppIds.length > 0;
  const hasAlternatives = showEditions || showDlc || showBundleContents;

  // Summary line for the closed trigger.
  const selectedCount = selectedKeys.length;
  const triggerLabel = (() => {
    if (isBundle) return t("bundleSummary", { count: bundleIds.length });
    if (selectedCount === 0) return t("placeholder");
    if (selectedCount > 1) return t("nItemsSelected", { count: selectedCount });
    if (!rootGame) return t("placeholder");
    const key = selectedKeys[0];
    if (key.startsWith("pkg-")) {
      const id = Number(key.slice(4));
      const e = rootGame.editions.find((x) => x.packageid === id);
      return e ? editionLabel(e, rootGame.name) : rootGame.name;
    }
    if (key.startsWith("dlc-")) {
      const id = Number(key.slice(4));
      const idx = dlcIds.indexOf(id);
      const data = idx >= 0 ? dlcQueries[idx]?.data : null;
      return data?.name ?? t("dlcFallback", { id });
    }
    return rootGame.name;
  })();

  const inner = (
    <>
      {!hasGame ? (
        <p className="text-muted-foreground text-xs">{t("idle")}</p>
      ) : hasAlternatives ? (
        <div className="flex flex-col gap-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="border-input hover:bg-accent/40 focus:ring-ring flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:ring-2 focus:outline-none"
                aria-haspopup="listbox"
                aria-expanded={open}
              >
                <span className="truncate text-left">{triggerLabel}</span>
                <ChevronDown className="size-4 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-96 w-(--radix-popover-trigger-width) overflow-auto p-1"
            >
              {showEditions
                ? rootGame.editions.map((e) => {
                    const key = `pkg-${e.packageid}`;
                    const checked = selectedSet.has(key);
                    const useUsd = e.priceUsd != null;
                    const dPct = useUsd ? e.discountPercentUsd : e.discountPercent;
                    const original = useUsd ? e.originalPriceUsd : e.originalPriceVnd;
                    return (
                      <OptionRow
                        key={key}
                        checked={checked}
                        onToggle={() => toggle(key)}
                        label={editionLabel(e, rootGame.name)}
                        price={format(e.priceVnd, e.priceUsd)}
                        originalPrice={
                          dPct > 0 && original != null
                            ? format(e.originalPriceVnd, e.originalPriceUsd)
                            : undefined
                        }
                        discountPercent={dPct}
                      />
                    );
                  })
                : null}
              {showDlc
                ? rootGame.dlcAppIds.map((id, idx) => {
                    const key = `dlc-${id}`;
                    const q = dlcQueries[idx];
                    const name = q?.data?.name ?? t("dlcFallback", { id });
                    const vnd = q?.data?.priceVnd ?? null;
                    const usd = q?.data?.priceUsd ?? null;
                    return (
                      <OptionRow
                        key={key}
                        checked={selectedSet.has(key)}
                        onToggle={() => toggle(key)}
                        label={`${t("dlcPrefix")} · ${name}`}
                        price={q?.isLoading ? t("loading") : format(vnd, usd)}
                      />
                    );
                  })
                : null}
              {showBundleContents ? (
                <>
                  <div className="text-muted-foreground px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide uppercase">
                    {t("bundleContentsHeading")}
                  </div>
                  {rootGame.bundleAppIds.map((id, idx) => {
                    const q = bundleQueries[idx];
                    const name = q?.data?.name ?? t("dlcFallback", { id });
                    const vnd = q?.data?.priceVnd ?? null;
                    const usd = q?.data?.priceUsd ?? null;
                    return (
                      <OptionRow
                        key={`bundle-${id}`}
                        showCheckbox={false}
                        label={name}
                        price={q?.isLoading ? t("loading") : format(vnd, usd)}
                      />
                    );
                  })}
                </>
              ) : null}
            </PopoverContent>
          </Popover>
          {isBundle ? null : (
            <label className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
              <span>{t("modeLabel")}</span>
              <span className="flex items-center gap-2">
                <span className={cn(mode === "single" && "text-foreground font-semibold")}>
                  {t("modeSingle")}
                </span>
                <Switch
                  checked={mode === "multi"}
                  onCheckedChange={(v) => onModeChange(v ? "multi" : "single")}
                  aria-label={t("modeLabel")}
                />
                <span className={cn(mode === "multi" && "text-foreground font-semibold")}>
                  {t("modeMulti")}
                </span>
              </span>
            </label>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("noAlternatives")}</p>
      )}
    </>
  );

  if (noCard) {
    return <div className={cn("mt-4", className)}>{inner}</div>;
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}

function OptionRow({
  checked,
  onToggle,
  label,
  price,
  originalPrice,
  discountPercent,
  showCheckbox = true,
}: {
  checked?: boolean;
  onToggle?: () => void;
  label: string;
  price: string;
  originalPrice?: string;
  discountPercent?: number;
  showCheckbox?: boolean;
}) {
  // Bundle-contents rows are informational, so they don't render as a
  // <label> + Checkbox (which would steal focus and look interactive).
  const Wrapper = showCheckbox ? "label" : "div";
  return (
    <Wrapper
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
        showCheckbox && "hover:bg-accent hover:text-accent-foreground cursor-pointer",
      )}
    >
      {showCheckbox ? <Checkbox checked={checked} onCheckedChange={onToggle} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {originalPrice ? (
          <span className="text-muted-foreground line-through">{originalPrice}</span>
        ) : null}
        {discountPercent && discountPercent > 0 ? (
          <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-medium text-emerald-600">
            −{discountPercent}%
          </span>
        ) : null}
        <span className="text-muted-foreground">{price}</span>
      </span>
    </Wrapper>
  );
}

function editionLabel(edition: Edition, gameName: string): string {
  const name = edition.name.toLowerCase();
  const game = gameName.toLowerCase();
  // Franchise/base case: "Subnautica" package for "Subnautica 2" app.
  if (game.startsWith(name)) return gameName;
  // Full edition name already includes the game name: "AI LIMIT Deluxe Edition".
  if (name.startsWith(game)) return edition.name;
  // Edition-type only: "Deluxe Edition" → "AI LIMIT Deluxe Edition".
  return `${gameName} ${edition.name}`;
}
