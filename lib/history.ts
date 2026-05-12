"use client";

import { useCallback, useEffect, useState } from "react";

export type HistoryEntry = {
  appid: number;
  name: string;
  image: string | null;
  addedAt: number;
};

const STORAGE_KEY = "steam-history";
const MAX_ENTRIES = 10;

function readStorage(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        e != null &&
        typeof e.appid === "number" &&
        typeof e.name === "string" &&
        typeof e.addedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeStorage(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or disabled storage — silently ignore.
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // localStorage is only available on the client; hydrate after mount to
  // avoid a hydration mismatch with the empty SSR pass.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHistory(readStorage()), []);

  const addEntry = useCallback((entry: Omit<HistoryEntry, "addedAt">) => {
    setHistory((prev) => {
      const next = [
        { ...entry, addedAt: Date.now() },
        ...prev.filter((e) => e.appid !== entry.appid),
      ].slice(0, MAX_ENTRIES);
      writeStorage(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((appid: number) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.appid !== appid);
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    writeStorage([]);
  }, []);

  return { history, addEntry, removeEntry, clear };
}
