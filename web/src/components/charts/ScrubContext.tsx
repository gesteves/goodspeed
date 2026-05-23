"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ScrubValue {
  /** Index of the timeseries point under the pointer, or null. */
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
}

const ScrubContext = createContext<ScrubValue | null>(null);

/** Shares the hovered/scrubbed timeseries index across every stacked chart. */
export function ScrubProvider({ children }: { children: ReactNode }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const value = useMemo(
    () => ({ hoveredIndex, setHoveredIndex }),
    [hoveredIndex],
  );
  return <ScrubContext value={value}>{children}</ScrubContext>;
}

export function useScrub(): ScrubValue {
  const ctx = useContext(ScrubContext);
  if (!ctx) throw new Error("useScrub must be used within a ScrubProvider");
  return ctx;
}
