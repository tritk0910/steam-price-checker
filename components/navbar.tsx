"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import { type Locale } from "@/i18n/config";
import { useCurrency } from "@/lib/currency-context";
import { cn } from "@/lib/utils";

export function Navbar() {
  const t = useTranslations();
  const locale = useLocale();
  const { showUsd, setShowUsd } = useCurrency();
  const [pending, startTransition] = useTransition();

  const switchLocale = (next: string) => {
    if (next === locale) return;
    startTransition(() => setLocale(next as Locale));
  };

  const segBtnCls = (active: boolean) =>
    cn(
      "border-0 bg-transparent text-ink-3 font-bold text-[12px] tracking-[0.04em] px-[14px] py-[7px] rounded-full cursor-pointer transition-[color,background] duration-[180ms]",
      active && "text-ink",
    );

  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      {/* Backdrop blur — fades in on scroll */}
      <div className="pointer-events-none absolute inset-0 -z-1 h-[180%] w-full translate-y-[-30%]">
        <div className="blur-mask-sm absolute inset-0 z-2 backdrop-blur-[1px]" />
        <div className="blur-mask-md absolute inset-0 z-3 backdrop-blur-[2px]" />
        <div className="blur-mask-lg absolute inset-0 z-4 backdrop-blur-xs" />
        <div className="blur-mask-xl absolute inset-0 z-5 backdrop-blur-sm" />
      </div>
      {/* Gradient tint — fades in on scroll */}
      <div
        className={cn("pointer-events-none absolute inset-0 -bottom-7 -z-1 opacity-100 bg-nav-tint")}
      />

      <nav
        data-nav
        className={cn(
          "mx-auto flex max-w-285 items-center justify-between px-8 py-5.5 transition-[padding] duration-300 max-sm:flex-wrap max-sm:gap-3 max-sm:px-4.5 z-50",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
           <Image
              src="/logo.png"
              alt=""
              width={52}
              height={52}
              loading="eager"
              className="object-contain rounded-xl"
            />
          <div>
            <div className="font-heading text-ink text-[17px] font-bold tracking-[-0.01em]">
              {t("header.title")}
            </div>
            <div className="font-code text-ink-3 text-[11.5px] tracking-[0.06em] uppercase">
              steamgift.neozzz.dev
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5">
          {/* Currency */}
          <div
            className="border-line flex rounded-full border bg-white/5 p-0.75 backdrop-blur-md"
            role="group"
            aria-label="Currency"
          >
            <button
              type="button"
              className={cn(segBtnCls(!showUsd), !showUsd && "bg-hi-active")}
              onClick={() => setShowUsd(false)}
            >
              VND
            </button>
            <button
              type="button"
              className={cn(segBtnCls(showUsd), showUsd && "bg-hi-active")}
              onClick={() => setShowUsd(true)}
            >
              USD
            </button>
          </div>

          {/* Language */}
          <div
            className="border-line flex rounded-full border bg-white/5 p-0.75 backdrop-blur-md"
            role="group"
            aria-label="Language"
          >
            <button
              type="button"
              disabled={pending}
              className={cn(segBtnCls(locale === "en"), locale === "en" && "bg-hi-active")}
              onClick={() => switchLocale("en")}
            >
              EN
            </button>
            <button
              type="button"
              disabled={pending}
              className={cn(segBtnCls(locale === "vi"), locale === "vi" && "bg-hi-active")}
              onClick={() => switchLocale("vi")}
            >
              VI
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
