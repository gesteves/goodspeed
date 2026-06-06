import { formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TZ } from "./constants";

/** Formatting helpers. All times render in the swim's local timezone. */

const FALLBACK = "—";

const toDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

/**
 * `formatInTimeZone` throws on a malformed ISO string. Wrap so a single bad
 * timestamp returns an em-dash placeholder instead of crashing the panel
 * (every formatter is called from render).
 */
function safeFormat(value: string | number | Date, fmt: string): string {
  try {
    return formatInTimeZone(toDate(value), DISPLAY_TZ, fmt);
  } catch {
    return FALLBACK;
  }
}

/** "3:00 PM" */
export function formatClock(value: string | number | Date): string {
  return safeFormat(value, "h:mm a");
}

/** "3:00 PM PDT" */
export function formatClockWithZone(value: string | number | Date): string {
  return safeFormat(value, "h:mm a zzz");
}

/** "Fri 3:00 PM" */
export function formatDayClock(value: string | number | Date): string {
  return safeFormat(value, "EEE h:mm a");
}

/** "May 22, 3:00 PM PDT" */
export function formatDateTime(value: string | number | Date): string {
  return safeFormat(value, "MMM d, h:mm a zzz");
}

/** "June 7th, 2026 at 7:00 AM" (display TZ is implied — always SF). */
export function formatLongDateTime(value: string | number | Date): string {
  return safeFormat(value, "MMMM do, yyyy 'at' h:mm a");
}

/** Short chart x-axis label, e.g. "3 PM" or "Fri" at midnight. */
export function formatAxisTick(value: string | number | Date): string {
  try {
    const d = toDate(value);
    const hour = Number(formatInTimeZone(d, DISPLAY_TZ, "H"));
    return hour === 0
      ? formatInTimeZone(d, DISPLAY_TZ, "EEE")
      : formatInTimeZone(d, DISPLAY_TZ, "ha");
  } catch {
    return FALLBACK;
  }
}

/** Compact relative time, minute-precise: "just now", "35m ago", "in 1h 5m", "2d 3h ago". */
export function formatRelative(
  value: string | number | Date,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - toDate(value).getTime();
  const past = diffMs >= 0;
  const totalMins = Math.round(Math.abs(diffMs) / 60_000);
  if (totalMins < 1) return "just now";

  let text: string;
  if (totalMins < 60) {
    text = `${totalMins}m`;
  } else if (totalMins < 24 * 60) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    text = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  } else {
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    text = hours === 0 ? `${days}d` : `${days}d ${hours}h`;
  }
  return past ? `${text} ago` : `in ${text}`;
}

/** Fixed-decimal number for display. */
export function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}
