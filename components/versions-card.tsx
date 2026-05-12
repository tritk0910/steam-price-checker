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
  | { kind: "package"; packageid: number; name: string; priceVnd: number | null; discountPercent: number }
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
  format: (v: number | null | undefined) => string;
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
        discountPercent: edition.discountPercent,
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
  const showEditions = hasGame && rootGame.editions.length > 1;
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
              <SelectItem value={ROOT_VALUE}>
                <OptionRow
                  label={`${rootGame.name} (${t("base")})`}
                  price={format(rootGame.priceVnd)}
                />
              </SelectItem>
              {showEditions
                ? rootGame.editions.map((e) => (
                    <SelectItem key={`pkg-${e.packageid}`} value={`pkg-${e.packageid}`}>
                      <OptionRow label={editionLabel(e, rootGame.name)} price={format(e.priceVnd)} />
                    </SelectItem>
                  ))
                : null}
              {showDlc
                ? rootGame.dlcAppIds.map((id, idx) => {
                    const q = dlcQueries[idx];
                    const name = q?.data?.name ?? t("dlcFallback", { id });
                    const price = q?.data?.priceVnd ?? null;
                    return (
                      <SelectItem key={`dlc-${id}`} value={`dlc-${id}`}>
                        <OptionRow
                          label={`${t("dlcPrefix")} · ${name}`}
                          price={q?.isLoading ? t("loading") : format(price)}
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

function OptionRow({ label, price }: { label: string; price: string }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{price}</span>
    </span>
  );
}

function variantToValue(v: Variant): string {
  if (v.kind === "root") return ROOT_VALUE;
  if (v.kind === "package") return `pkg-${v.packageid}`;
  return `dlc-${v.appid}`;
}

function editionLabel(edition: Edition, gameName: string): string {
  // If the API couldn't strip the game name (or there's only one sub), the
  // edition.name equals the game name. Show "Standard Edition" as a friendly
  // fallback so the option isn't a duplicate of the base row.
  if (edition.name === gameName) return "Standard Edition";
  return edition.name;
}
