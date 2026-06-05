import { fromZonedTime } from "date-fns-tz";
import { DISPLAY_TZ } from "@/lib/constants";

/**
 * Parse the configured race start time. The value is written as a plain SF
 * wall-clock string (`YYYY-MM-DDTHH:mm`, no UTC offset) for ease of editing
 * once a year; `fromZonedTime` resolves it as `America/Los_Angeles` so DST is
 * handled. Returns `null` on an empty/invalid string so callers can simply hide
 * the race panel rather than crash.
 */
export function parseRaceStart(raw: string | undefined): Date | null {
  if (!raw) return null;
  try {
    const d = fromZonedTime(raw, DISPLAY_TZ);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Whether `target` falls within the feed's covered time range (inclusive of the
 * first and last timestamp). The forecast horizon (~48h) defines availability:
 * if the race is still days out or already past the forecast, there's no point
 * to show. `times` is assumed ascending (the feed timeseries is).
 */
export function isInFeedRange(
  times: readonly string[],
  target: Date,
): boolean {
  if (times.length === 0) return false;
  const t = target.getTime();
  return (
    t >= new Date(times[0]).getTime() &&
    t <= new Date(times[times.length - 1]).getTime()
  );
}
