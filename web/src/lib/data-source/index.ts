import { fetchFeed } from "./sfbofs";
import type { DashboardData } from "./types";
import { getWeather } from "./weather";

export type { DashboardData } from "./types";

/**
 * The single data entry point for the dashboard. Aggregates every source so
 * pages depend on this, not on individual feeds.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [feed, weather] = await Promise.all([fetchFeed(), getWeather()]);
  return { feed, weather };
}
