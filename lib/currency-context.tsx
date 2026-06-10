"use client";

import { createContext, useContext, useState } from "react";

interface CurrencyContextValue {
  showUsd: boolean;
  setShowUsd: (v: boolean) => void;
}

export const CurrencyContext = createContext<CurrencyContextValue>({
  showUsd: false,
  setShowUsd: () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [showUsd, setShowUsd] = useState(false);
  return (
    <CurrencyContext.Provider value={{ showUsd, setShowUsd }}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
