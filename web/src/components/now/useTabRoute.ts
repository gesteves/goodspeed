import { useCallback, useEffect, useState } from "react";
import type { TabKey } from "./NowPanel";

/** The route each tab maps to, so the URL stays in sync with the visible tab. */
export const pathForTab = (tab: TabKey): string =>
  tab === "race" ? "/race-day" : "/";

export const tabForPath = (path: string): TabKey =>
  path === "/race-day" ? "race" : "now";

/**
 * Tab state backed by the URL. `selectTab` (a user toggle) pushes a history
 * entry so Back returns to the prior tab; Back/Forward navigation between `/`
 * and `/race-day` is reflected onto the tab via `popstate`. Keeping the URL
 * canonical is split across two places: this hook handles the user-driven
 * transitions, while the caller `replaceState`s to match the *visible* tab when
 * the race tab isn't actually available (see `Dashboard`).
 */
export function useTabRoute(
  initialTab: TabKey,
): readonly [TabKey, (next: TabKey) => void] {
  const [tab, setTab] = useState<TabKey>(initialTab);

  const selectTab = useCallback((next: TabKey) => {
    setTab(next);
    const path = pathForTab(next);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setTab(tabForPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return [tab, selectTab] as const;
}
