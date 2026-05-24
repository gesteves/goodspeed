import { angularDelta } from "@/lib/angles";
import { FLOOD_BEARING_DEG, SLACK_CURRENT_KT } from "@/lib/constants";
import type { TimeseriesPoint } from "@/lib/schema";

export type CurrentPhase = "flood" | "ebb" | "slack";

/**
 * Flood / ebb / slack for a timeseries point. Flood = current flowing into the
 * bay, ebb = out toward the Golden Gate -- classified by direction relative to
 * the approximate flood set (see FLOOD_BEARING_DEG). Below SLACK_CURRENT_KT the
 * current is treated as slack.
 */
export function classifyCurrent(p: TimeseriesPoint): CurrentPhase {
  if (p.current_speed_kt < SLACK_CURRENT_KT) return "slack";
  return angularDelta(p.current_bearing_deg, FLOOD_BEARING_DEG) <= 90
    ? "flood"
    : "ebb";
}
