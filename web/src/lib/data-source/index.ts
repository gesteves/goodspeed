import { fetchFieldFeed } from "./field";
import { fetchFeed } from "./sfbofs";
import type { DashboardData } from "./types";
import { getWeather } from "./weather";

export type { DashboardData } from "./types";
export type { FieldStatus } from "./field";

/**
 * The single data entry point for the dashboard. Aggregates every source so
 * pages depend on this, not on individual feeds.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [feed, fieldResult, weather] = await Promise.all([
    fetchFeed(),
    fetchFieldFeed(),
    getWeather(),
  ]);
  return {
    feed,
    field: fieldResult.feed,
    fieldStatus: fieldResult.status,
    weather,
  };
}
