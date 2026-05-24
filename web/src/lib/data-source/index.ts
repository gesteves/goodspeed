import { fetchFieldFeed } from "./field";
import { fetchFeed } from "./sfbofs";
import type { DashboardData } from "./types";

export type { DashboardData } from "./types";
export type { FieldStatus } from "./field";

/**
 * The single data entry point for the dashboard. Aggregates every source so
 * pages depend on this, not on individual feeds.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [feed, fieldResult] = await Promise.all([
    fetchFeed(),
    fetchFieldFeed(),
  ]);
  return {
    feed,
    field: fieldResult.feed,
    fieldStatus: fieldResult.status,
  };
}

/**
 * SSR-fast variant: only awaits the point feed (small, fast, drives the
 * always-visible NowPanel + charts). The map's gridded field feed is the
 * larger, slower payload and the dashboard already degrades gracefully when
 * it's missing, so we hand back `fieldStatus: "loading"` and let the island
 * fetch the full payload from `/dashboard.json` right after hydration. The
 * edge-cached HTML response is what makes this worthwhile.
 */
export async function getDashboardDataPointOnly(): Promise<DashboardData> {
  const feed = await fetchFeed();
  return { feed, field: null, fieldStatus: "loading" };
}
