import { formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TZ } from "./constants";

/** Formatting helpers. All times render in the swim's local timezone. */

const toDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

/** "3:00 PM" */
export function formatClock(value: string | number | Date): string {
  return formatInTimeZone(toDate(value), DISPLAY_TZ, "h:mm a");
}

/** "Fri 3:00 PM" */
export function formatDayClock(value: string | number | Date): string {
  return formatInTimeZone(toDate(value), DISPLAY_TZ, "EEE h:mm a");
}

/** "May 22, 3:00 PM PDT" */
export function formatDateTime(value: string | number | Date): string {
  return formatInTimeZone(toDate(value), DISPLAY_TZ, "MMM d, h:mm a zzz");
}

/** Short chart x-axis label, e.g. "3 PM" or "Fri" at midnight. */
export function formatAxisTick(value: string | number | Date): string {
  const d = toDate(value);
  const hour = Number(formatInTimeZone(d, DISPLAY_TZ, "H"));
  return hour === 0
    ? formatInTimeZone(d, DISPLAY_TZ, "EEE")
    : formatInTimeZone(d, DISPLAY_TZ, "ha");
}

/** Compact relative time: "just now", "2h ago", "in 35m". */
export function formatRelative(
  value: string | number | Date,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - toDate(value).getTime();
  const past = diffMs >= 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);
  if (mins < 1) return "just now";

  let text: string;
  if (mins < 60) {
    text = `${mins}m`;
  } else {
    const hours = Math.round(mins / 60);
    text = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  }
  return past ? `${text} ago` : `in ${text}`;
}

/** Fixed-decimal number for display. */
export function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}
