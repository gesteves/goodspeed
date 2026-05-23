import type { TimeseriesPoint } from "@/lib/schema";

/** Index of the timeseries point closest to `now`. */
export function findNowIndex(
  ts: TimeseriesPoint[],
  now: Date = new Date(),
): number {
  const target = now.getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < ts.length; i++) {
    const diff = Math.abs(new Date(ts[i].t).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/** Direction the water level is moving around `index`. */
export function levelTrend(
  ts: TimeseriesPoint[],
  index: number,
): "rising" | "falling" | "steady" {
  const prev = ts[Math.max(0, index - 5)];
  const next = ts[Math.min(ts.length - 1, index + 5)];
  const delta = next.water_level_m - prev.water_level_m;
  if (delta > 0.02) return "rising";
  if (delta < -0.02) return "falling";
  return "steady";
}
