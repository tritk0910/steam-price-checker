"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartEntry } from "@/lib/cart";

const STORAGE_KEY = "steam-cart";

function readStorage(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CartEntry =>
        e != null && typeof e.id === "string" && typeof e.appid === "number",
    );
  } catch {
    return [];
  }
}

function writeStorage(entries: CartEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or disabled storage — silently ignore.
  }
}

export function useCart() {
  const [entries, setEntries] = useState<CartEntry[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setEntries(readStorage()), []);

  const addEntry = useCallback((entry: CartEntry) => {
    setEntries((prev) => {
      const next = [...prev.filter((e) => e.id !== entry.id), entry];
      writeStorage(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  const reorderEntries = useCallback((next: CartEntry[]) => {
    setEntries(next);
    writeStorage(next);
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    writeStorage([]);
  }, []);

  return { entries, addEntry, removeEntry, reorderEntries, clear };
}
