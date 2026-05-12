"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleToggle() {
  const current = useLocale();
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 text-xs"
      aria-label={t("label")}
    >
      {locales.map((loc) => {
        const isActive = current === loc;
        return (
          <button
            key={loc}
            type="button"
            disabled={pending || isActive}
            onClick={() => startTransition(() => setLocale(loc as Locale))}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={isActive}
          >
            {t(loc)}
          </button>
        );
      })}
    </div>
  );
}
