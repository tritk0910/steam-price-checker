"use client";

import axios from "axios";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Edition, GamePriceResult } from "@/lib/steam";

export type Variant =
  | { kind: "root" }
  | {
      kind: "package";
      packageid: number;
      name: string;
      priceVnd: number | null;
      originalPriceVnd: number | null;
      discountPercent: number;
      priceUsd: number | null;
      originalPriceUsd: number | null;
      discountPercentUsd: number;
    }
  | { kind: "dlc"; appid: number };

const ROOT_VALUE = "root";
const EMPTY_DLC_IDS: number[] = [];

async function fetchGame(appid: number): Promise<GamePriceResult> {
  const { data } = await axios.get<GamePriceResult>(`/api/game/${appid}`);
  return data;
}

export function VersionsCard({
  rootGame,
  variant,
  onChange,
  format,
  className,
}: {
  rootGame: GamePriceResult | null;
  variant: Variant;
  onChange: (next: Variant) => void;
  format: (vnd: number | null | undefined, usd: number | null | undefined) => string;
  className?: string;
}) {
  const t = useTranslations("steps.versions");
  const [open, setOpen] = useState(false);

  // Hooks must be called unconditionally — keep useQueries always invoked but
  // pass an empty list when no game is loaded.
  const dlcIds = rootGame?.dlcAppIds ?? EMPTY_DLC_IDS;
  const dlcQueries = useQueries({
    queries: dlcIds.map((id) => ({
      queryKey: ["game", id],
      queryFn: () => fetchGame(id),
      enabled: open && rootGame != null,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const value = variantToValue(variant);

  const handleChange = (next: string) => {
    if (!rootGame) return;
    if (next === ROOT_VALUE) {
      onChange({ kind: "root" });
      return;
    }
    if (next.startsWith("pkg-")) {
      const packageid = Number(next.slice(4));
      const edition = rootGame.editions.find((e) => e.packageid === packageid);
      if (!edition) return;
      onChange({
        kind: "package",
        packageid,
        name: edition.name,
        priceVnd: edition.priceVnd,
        originalPriceVnd: edition.originalPriceVnd,
        discountPercent: edition.discountPercent,
        priceUsd: edition.priceUsd,
        originalPriceUsd: edition.originalPriceUsd,
        discountPercentUsd: edition.discountPercentUsd,
      });
      return;
    }
    if (next.startsWith("dlc-")) {
      const appid = Number(next.slice(4));
      if (!Number.isFinite(appid)) return;
      onChange({ kind: "dlc", appid });
    }
  };

  const hasGame = rootGame != null;
  // First edition is normally the base sub at the same price, so showing a
  // dedicated "base" row above it duplicates it. We list editions directly.
  const showEditions = hasGame && rootGame.editions.length > 0;
  const showDlc = hasGame && rootGame.dlcAppIds.length > 0;
  const hasAlternatives = showEditions || showDlc;

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
          <Select value={value} onValueChange={handleChange} onOpenChange={setOpen}>
            <SelectTrigger>
              <SelectValue placeholder={t("placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {showEditions
                ? rootGame.editions.map((e) => {
                    const useUsd = e.priceUsd != null;
                    const dPct = useUsd ? e.discountPercentUsd : e.discountPercent;
                    const original = useUsd ? e.originalPriceUsd : e.originalPriceVnd;
                    return (
                      <SelectItem key={`pkg-${e.packageid}`} value={`pkg-${e.packageid}`}>
                        <OptionRow
                          label={editionLabel(e, rootGame.name)}
                          price={format(e.priceVnd, e.priceUsd)}
                          originalPrice={
                            dPct > 0 && original != null
                              ? format(e.originalPriceVnd, e.originalPriceUsd)
                              : undefined
                          }
                          discountPercent={dPct}
                        />
                      </SelectItem>
                    );
                  })
                : null}
              {showDlc
                ? rootGame.dlcAppIds.map((id, idx) => {
                    const q = dlcQueries[idx];
                    const name = q?.data?.name ?? t("dlcFallback", { id });
                    const vnd = q?.data?.priceVnd ?? null;
                    const usd = q?.data?.priceUsd ?? null;
                    return (
                      <SelectItem key={`dlc-${id}`} value={`dlc-${id}`}>
                        <OptionRow
                          label={`${t("dlcPrefix")} · ${name}`}
                          price={q?.isLoading ? t("loading") : format(vnd, usd)}
                        />
                      </SelectItem>
                    );
                  })
                : null}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">{t("noAlternatives")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function OptionRow({
  label,
  price,
  originalPrice,
  discountPercent,
}: {
  label: string;
  price: string;
  originalPrice?: string;
  discountPercent?: number;
}) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="truncate">{label}</span>
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
    </span>
  );
}

function variantToValue(v: Variant): string {
  if (v.kind === "root") return ROOT_VALUE;
  if (v.kind === "package") return `pkg-${v.packageid}`;
  return `dlc-${v.appid}`;
}

function editionLabel(edition: Edition, gameName: string): string {
  // Prefer the full app name when Steam's package label is a (case-insensitive)
  // prefix of it — Steam sometimes uses the franchise name for the base sub,
  // e.g. option_text "Subnautica" for the "Subnautica 2" app. Equal strings
  // also satisfy this, so the dropdown shows the canonical app name.
  if (gameName.toLowerCase().startsWith(edition.name.toLowerCase())) return gameName;
  return edition.name;
}
