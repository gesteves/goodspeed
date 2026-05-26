import type { TimeseriesPoint } from "@/lib/schema";

/** Index of the ISO-8601 timestamp in `times` closest to `target`. */
export function nearestTimeIndex(
  times: readonly string[],
  target: Date = new Date(),
): number {
  const t = target.getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/** Index of the timeseries point closest to `now`. */
export function findNowIndex(
  ts: TimeseriesPoint[],
  now: Date = new Date(),
): number {
  return nearestTimeIndex(
    ts.map((p) => p.t),
    now,
  );
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

/** Direction the water temperature is moving around `index`. Same ±30-min
 *  window as `levelTrend`; threshold of 0.05 °C over the hour-wide span is
 *  roughly 2× the typical diurnal rate, so genuine trends register without
 *  noise flickering the icon. */
export function tempTrend(
  ts: TimeseriesPoint[],
  index: number,
): "rising" | "falling" | "steady" {
  const prev = ts[Math.max(0, index - 5)];
  const next = ts[Math.min(ts.length - 1, index + 5)];
  const delta = next.water_temp_c - prev.water_temp_c;
  if (delta > 0.05) return "rising";
  if (delta < -0.05) return "falling";
  return "steady";
}
