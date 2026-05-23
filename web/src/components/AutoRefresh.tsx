"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Quietly refreshes the page's Server Components on an interval so the
 * "Right now" readings, the "now" marker on every chart, and the timestamp
 * pill stay current. The feed fetch itself is cached (`revalidate: 300`), so
 * each tick costs ~nothing until a fresh cycle is available; when one is, the
 * graphs swap in seamlessly.
 *
 * Also refreshes when the tab becomes visible or the device comes back online,
 * so opening the page after a while is immediately up to date.
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const id = window.setInterval(refresh, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
