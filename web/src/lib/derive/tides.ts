import type { TimeseriesPoint } from "@/lib/schema";

export interface TideEvent {
  index: number;
  t: string;
  type: "high" | "low";
  water_level_m: number;
  water_level_ft: number;
}

/** Half-width (in 6-min samples) of the window used to find tide extrema. */
const WINDOW = 12; // +-72 min

/**
 * Local maxima/minima of the water level -- the tide highs and lows.
 * A point qualifies when it is the strict max (or min) within +-WINDOW samples;
 * plateaus of equal samples collapse to their midpoint. Extrema within WINDOW
 * of the series ends are not detected.
 */
export function findTideExtrema(ts: TimeseriesPoint[]): TideEvent[] {
  const raw: TideEvent[] = [];
  for (let i = WINDOW; i < ts.length - WINDOW; i++) {
    const v = ts[i].water_level_m;
    let isMax = true;
    let isMin = true;
    for (let j = i - WINDOW; j <= i + WINDOW && (isMax || isMin); j++) {
      if (j === i) continue;
      if (ts[j].water_level_m > v) isMax = false;
      if (ts[j].water_level_m < v) isMin = false;
    }
    if (isMax === isMin) continue; // flat window or not an extremum
    raw.push({
      index: i,
      t: ts[i].t,
      type: isMax ? "high" : "low",
      water_level_m: ts[i].water_level_m,
      water_level_ft: ts[i].water_level_ft,
    });
  }

  // Collapse runs of the same type that sit within a window of each other.
  const events: TideEvent[] = [];
  let group: TideEvent[] = [];
  const flush = () => {
    if (group.length) events.push(group[Math.floor(group.length / 2)]);
    group = [];
  };
  for (const e of raw) {
    const prev = group[group.length - 1];
    if (prev && prev.type === e.type && e.index - prev.index <= WINDOW) {
      group.push(e);
    } else {
      flush();
      group = [e];
    }
  }
  flush();
  return events;
}

/** First tide event strictly after `after`, or null. */
export function nextTideEvent(
  events: TideEvent[],
  after: Date,
): TideEvent | null {
  const t = after.getTime();
  return events.find((e) => new Date(e.t).getTime() > t) ?? null;
}
