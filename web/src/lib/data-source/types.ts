import type { Feed, FieldFeed } from "@/lib/schema";
import type { Weather } from "./weather";

/** Everything the dashboard renders from. */
export interface DashboardData {
  feed: Feed;
  field: FieldFeed | null;
  weather: Weather;
}
