import type { Feed } from "@/lib/schema";
import type { Weather } from "./weather";

/** Everything the dashboard renders from. */
export interface DashboardData {
  feed: Feed;
  weather: Weather;
}
