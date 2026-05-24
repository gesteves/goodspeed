import type { Feed, FieldFeed } from "@/lib/schema";
import type { FieldStatus } from "./field";

/** Everything the dashboard renders from. */
export interface DashboardData {
  feed: Feed;
  field: FieldFeed | null;
  fieldStatus: FieldStatus;
}
