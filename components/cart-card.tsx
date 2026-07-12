"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ShoppingCart, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { calculate, formatUsd, formatUsdNative, formatVnd } from "@/lib/calc";
import type { CartEntry } from "@/lib/cart";
import { cn } from "@/lib/utils";

type CartCardProps = {
  entries: CartEntry[];
  onRemove: (id: string) => void;
  onReorder: (next: CartEntry[]) => void;
  onSelect: (entry: CartEntry) => void;
  onClear: () => void;
  keyPriceVnd: number | null;
  feePercent: number;
  keyBuyPrice: number;
  giftRate: number | null;
  vndPerUsd: number;
  showUsd: boolean;
};

export function CartCard({
  entries,
  onRemove,
  onReorder,
  onSelect,
  onClear,
  keyPriceVnd,
  feePercent,
  keyBuyPrice,
  giftRate,
  vndPerUsd,
  showUsd,
}: CartCardProps) {
  const t = useTranslations("cart");
  const locale = useLocale();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = entries.findIndex((e) => e.id === active.id);
      const newIndex = entries.findIndex((e) => e.id === over.id);
      onReorder(arrayMove(entries, oldIndex, newIndex));
    }
  }

  // Use native USD (Steam US store price) when available; fall back to converting VND.
  const fmtEntry = (entry: CartEntry) => {
    if (showUsd) {
      return entry.totalUsd != null
        ? formatUsdNative(entry.totalUsd)
        : formatUsd(entry.totalVnd, vndPerUsd);
    }
    return formatVnd(entry.totalVnd);
  };

  // Cart total: sum native USD if every entry has one, else convert VND sum.
  const cartTotalVnd = entries.reduce((sum, e) => sum + (e.totalVnd ?? 0), 0);
  const cartTotalUsd = entries.every((e) => e.totalUsd != null)
    ? entries.reduce((sum, e) => sum + (e.totalUsd ?? 0), 0)
    : null;
  const fmtCartTotal = () => {
    if (showUsd) {
      return cartTotalUsd != null
        ? formatUsdNative(cartTotalUsd)
        : formatUsd(cartTotalVnd, vndPerUsd);
    }
    return formatVnd(cartTotalVnd);
  };

  // Comparison calc always uses VND (calc.ts operates in VND).
  const fmt = (vnd: number | null | undefined) =>
    showUsd ? formatUsd(vnd ?? null, vndPerUsd) : formatVnd(vnd ?? null);

  // Only the cart total is required. When the TF2 key price is unavailable the
  // TF2 route is dropped but the gifting route still renders.
  const result =
    cartTotalVnd > 0
      ? calculate({
          gamePriceVnd: cartTotalVnd,
          keyListPriceVnd: keyPriceVnd,
          keyBuyPriceVnd: keyBuyPrice,
          marketplaceFeePercent: feePercent,
          giftingRate: giftRate,
        })
      : null;

  return (
    <section className="bg-card-glass border-line reveal col-span-full overflow-hidden rounded-[18px] border backdrop-blur-[18px] [animation-delay:0.24s]">
      {/* Header */}
      <div className="flex items-center justify-between px-7 pt-6 pb-4">
        <div className="font-heading text-ink flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em]">
          <span className="border-hi-border text-hi-text grid h-5.5 w-5.5 shrink-0 place-items-center rounded-[7px] border">
            <ShoppingCart size={11} aria-hidden />
          </span>
          <span>{t("titleWithCount", { count: entries.length })}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-ink-3 hover:text-ink flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-[12px] transition-colors duration-150"
        >
          <Trash2 size={13} aria-hidden />
          {t("clearAll")}
        </button>
      </div>

      {/* Sortable item list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <div className="border-line-soft mx-7 flex flex-col divide-y border-t">
            {entries.map((entry) => (
              <SortableCartItem
                key={entry.id}
                entry={entry}
                onRemove={onRemove}
                onSelect={onSelect}
                fmtEntry={fmtEntry}
                removeLabel={t("remove")}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Total row */}
      <div className="border-line-soft mx-7 mt-1 flex items-center justify-between border-t py-3.5">
        <span className="text-ink-2 font-code text-[12px] tracking-[0.08em] uppercase">
          {t("total")}
        </span>
        <span className="font-code text-ink text-[18px] font-bold tracking-[-0.02em]">
          {fmtCartTotal()}
        </span>
      </div>

      {/* Comparison */}
      {result && cartTotalVnd > 0 ? (
        <>
          <div className="border-line-soft mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch border-t max-[920px]:grid-cols-1">
            {/* Gift route */}
            <div
              className={cn(
                "flex flex-col gap-1 p-[22px_28px] transition-[background] duration-250",
                result.cheapest === "gift" &&
                  "bg-[linear-gradient(145deg,color-mix(in_oklab,var(--good)_9%,transparent),transparent_65%)]",
              )}
            >
              <div className="text-ink-2 font-code flex items-center gap-2 text-[12px] tracking-[0.08em] uppercase">
                <span>{t("giftRoute")}</span>
                {result.cheapest === "gift" && (
                  <span className="bg-good rounded-[5px] px-1.75 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#06140c]">
                    {t("cheapest")}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "font-code mt-1.5 text-[26px] font-bold tracking-[-0.02em]",
                  result.cheapest === "gift" ? "text-good" : "text-ink",
                )}
              >
                {result.gift?.totalCostVnd != null ? fmt(result.gift.totalCostVnd) : "—"}
              </div>
              {result.gift && (
                <div className="mt-2 flex flex-col gap-1">
                  <RouteDetail label={t("giftRate")} value={`× ${result.gift.rate}`} />
                  <RouteDetail label={t("giftSteamPrice")} value={fmt(cartTotalVnd)} />
                  <RouteDetail label={t("giftCharges")} value={fmt(result.gift.totalCostVnd)} />
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
              <div className="bg-line absolute top-1/2 right-[calc(50%+30px)] left-3.5 hidden h-px -translate-y-1/2 max-[920px]:block" />
              <div className="bg-line absolute top-1/2 right-3.5 left-[calc(50%+30px)] hidden h-px -translate-y-1/2 max-[920px]:block" />
            </div>

            {/* TF2 route */}
            <div
              className={cn(
                "flex flex-col gap-1 p-[22px_28px] transition-[background] duration-250",
                result.cheapest === "tf" &&
                  "bg-[linear-gradient(215deg,color-mix(in_oklab,var(--good)_9%,transparent),transparent_65%)]",
              )}
            >
              <div className="text-ink-2 font-code flex items-center gap-2 text-[12px] tracking-[0.08em] uppercase">
                <span>{t("tfRoute")}</span>
                {result.cheapest === "tf" && (
                  <span className="bg-good rounded-[5px] px-1.75 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#06140c]">
                    {t("cheapest")}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "font-code mt-1.5 text-[26px] font-bold tracking-[-0.02em]",
                  result.cheapest === "tf" ? "text-good" : "text-ink",
                )}
              >
                {result.tf ? fmt(result.tf.effectiveCostVnd) : "—"}
              </div>
              {result.tf ? (
                <div className="mt-2 flex flex-col gap-1">
                  <RouteDetail label={t("tfKeysNeeded")} value={String(result.tf.keysNeeded)} />
                  <RouteDetail label={t("tfNetPerKey")} value={fmt(result.tf.netPerKeyVnd)} />
                  <RouteDetail label={t("tfCashPaid")} value={fmt(result.tf.cashPaidVnd)} />
                  <div className="text-ink border-line-soft mt-0.5 flex items-baseline justify-between gap-3 border-t pt-1.5 text-[12.5px] font-bold">
                    <span>{t("tfWalletAfter")}</span>
                    <span className="font-code shrink-0">
                      {fmt(result.tf.walletAfterPurchaseVnd)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-ink-3 mt-2 text-[12px] leading-normal">
                  {t("tfUnavailable")}
                </div>
              )}
            </div>
          </div>

          {/* Savings bar */}
          {result.gift && result.tf && result.cheapest !== "tie"
            ? (() => {
                const giftCost = result.gift.totalCostVnd ?? 0;
                const tfCost = result.tf.effectiveCostVnd;
                const winnerCost = result.cheapest === "gift" ? giftCost : tfCost;
                const loserCost = result.cheapest === "gift" ? tfCost : giftCost;
                const saving = loserCost - winnerCost;
                const pct = loserCost > 0 ? ((saving / loserCost) * 100).toFixed(1) : "0";
                const winnerLabel = result.cheapest === "gift" ? t("giftMethod") : t("tfMethod");
                const loserLabel = result.cheapest === "gift" ? t("tfMethod") : t("giftMethod");
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
        </>
      ) : null}
    </section>
  );
}

function SortableCartItem({
  entry,
  onRemove,
  onSelect,
  fmtEntry,
  removeLabel,
}: {
  entry: CartEntry;
  onRemove: (id: string) => void;
  onSelect: (entry: CartEntry) => void;
  fmtEntry: (entry: CartEntry) => string;
  removeLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 py-3.5 transition-opacity duration-150",
        isDragging && "opacity-40",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-ink-3 hover:text-ink shrink-0 cursor-grab touch-none border-none bg-transparent p-0.5 transition-colors duration-150 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} aria-hidden />
      </button>

      {/* Clickable: image + name */}
      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-none bg-transparent text-left"
      >
        {entry.imageUrl ? (
          <CartItemImage src={entry.imageUrl} />
        ) : (
          <div className="border-line-soft bg-stripe h-9 w-20 shrink-0 rounded-[6px] border" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-ink group-hover:text-hi truncate text-[13.5px] font-semibold transition-colors duration-150">
            {entry.name}
          </p>
          {entry.items.length > 1 && (
            <div className="text-ink-3 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px]">
              {entry.items.map((item) => (
                <span key={item.key} className="truncate">
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="font-code text-ink text-[13.5px] font-bold">{fmtEntry(entry)}</span>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label={removeLabel}
          className="text-ink-3 hover:text-ink cursor-pointer rounded-[6px] border-none bg-transparent p-1 transition-colors duration-150"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function CartItemImage({ src }: { src: string }) {
  const [imgSrc, setImgSrc] = useState(() =>
    src.replace(/capsule_616x353\.jpg(\?.*)?$/, "header.jpg"),
  );
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="border-line-soft bg-stripe mt-0.5 h-9 w-20 shrink-0 rounded-[6px] border" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt=""
      width={80}
      height={37}
      className="border-line-soft mt-0.5 h-9 w-20 shrink-0 rounded-[6px] border object-cover"
      onError={() => {
        if (imgSrc.includes("header.jpg")) {
          setFailed(true);
        } else {
          setImgSrc((s) => s.replace(/capsule_616x353\.jpg(\?.*)?$/, "header.jpg"));
        }
      }}
    />
  );
}

function RouteDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-ink-3 flex items-baseline justify-between gap-3 text-[12.5px]">
      <span>{label}</span>
      <span className="font-code shrink-0">{value}</span>
    </div>
  );
}
