import { angularDelta } from "@/lib/angles";
import {
  FLOOD_BEARING_DEG,
  SLACK_CURRENT_KT,
  SWIM_HEADING_DEG,
} from "@/lib/constants";
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

export type SwimRelation = "with" | "across" | "against";

export interface SwimRelative {
  /** Angle between the current's set and the swim heading (0..180). */
  deltaDeg: number;
  relation: SwimRelation;
  label: string;
}

/**
 * Where the current pushes relative to the Alcatraz -> Marina heading.
 * Purely geometric -- a factual annotation, not a swim recommendation.
 */
export function swimRelative(currentBearingDeg: number): SwimRelative {
  const deltaDeg = angularDelta(currentBearingDeg, SWIM_HEADING_DEG);
  let relation: SwimRelation;
  if (deltaDeg <= 60) relation = "with";
  else if (deltaDeg >= 120) relation = "against";
  else relation = "across";
  const label =
    relation === "with"
      ? "with the route"
      : relation === "against"
        ? "against the route"
        : "across the route";
  return { deltaDeg, relation, label };
}
