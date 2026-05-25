import type { UnitSystem } from "./units/units";

/** User preferences persisted in cookies so the server renders them flash-free. */

export const UNITS_COOKIE = "gs-units";
export const THEME_COOKIE = "gs-theme";

/** One year, in seconds. */
export const PREF_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "system" | "light" | "dark";

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === "imperial" || value === "metric";
}

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** Write a preference cookie from the client. */
export function writePref(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${PREF_MAX_AGE}; samesite=lax`;
}

/**
 * Read a preference cookie from the client. Returns `fallback` if the cookie
 * is missing, malformed, or fails `validate`. Safe to call during SSR or build
 * (returns `fallback` when `document` is unavailable).
 */
export function readPref<T extends string>(
  name: string,
  validate: (value: unknown) => value is T,
  fallback: T,
): T {
  if (typeof document === "undefined") return fallback;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = decodeURIComponent(trimmed.slice(prefix.length));
      return validate(value) ? value : fallback;
    }
  }
  return fallback;
}
