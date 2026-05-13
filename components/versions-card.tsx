"use client";

import axios from "axios";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
}: {
  rootGame: GamePriceResult | null;
  selectedKeys: string[];
  onChange: (next: string[]) => void;
  mode: SelectionMode;
  onModeChange: (next: SelectionMode) => void;
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
  className?: string;
}) {
  const t = useTranslations("steps.versions");
  const [open, setOpen] = useState(false);

  // Hooks must be called unconditionally — pass an empty list when no game is
  // loaded. Queries are lazy: they fire when the user opens the popover (so
  // we can list DLC names + prices) and stay enabled while items are selected.
  const dlcIds = rootGame?.dlcAppIds ?? EMPTY_DLC_IDS;
  const selectedSet = new Set(selectedKeys);
  const dlcQueries = useQueries({
    queries: dlcIds.map((id) => ({
      queryKey: ["game", id],
      queryFn: () => fetchGame(id),
      enabled: rootGame != null && (open || selectedSet.has(`dlc-${id}`)),
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
  const hasAlternatives = showEditions || showDlc;

  // Summary line for the closed trigger.
  const selectedCount = selectedKeys.length;
  const triggerLabel = (() => {
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

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasGame ? (
          <p className="text-xs text-muted-foreground">{t("idle")}</p>
        ) : hasAlternatives ? (
          <div className="flex flex-col gap-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
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
            </PopoverContent>
          </Popover>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("modeLabel")}</span>
            <span className="flex items-center gap-2">
              <span className={cn(mode === "single" && "font-semibold text-foreground")}>
                {t("modeSingle")}
              </span>
              <Switch
                checked={mode === "multi"}
                onCheckedChange={(v) => onModeChange(v ? "multi" : "single")}
                aria-label={t("modeLabel")}
              />
              <span className={cn(mode === "multi" && "font-semibold text-foreground")}>
                {t("modeMulti")}
              </span>
            </span>
          </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("noAlternatives")}</p>
        )}
      </CardContent>
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
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  price: string;
  originalPrice?: string;
  discountPercent?: number;
}) {
  return (
    <label className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
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
    </label>
  );
}

function editionLabel(edition: Edition, gameName: string): string {
  // Prefer the full app name when Steam's package label is a (case-insensitive)
  // prefix of it — Steam sometimes uses the franchise name for the base sub,
  // e.g. option_text "Subnautica" for the "Subnautica 2" app. Equal strings
  // also satisfy this, so the dropdown shows the canonical app name.
  if (gameName.toLowerCase().startsWith(edition.name.toLowerCase())) return gameName;
  return edition.name;
}
