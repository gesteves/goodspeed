import type { TimeseriesPoint } from "@/lib/schema";

/**
 * Unit handling. The feed already carries both unit systems, so switching
 * units is just choosing which field to read -- there is no conversion math.
 */

export type UnitSystem = "imperial" | "metric";

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial";

/** Regions that default to imperial units: the US and Liberia. */
const IMPERIAL_REGIONS = new Set(["US", "LR"]);

/**
 * Best-effort default unit system for a first-time visitor -- used only as the
 * fallback when there is no `gs-units` cookie yet, so an explicit toggle always
 * wins. Resolves a region from a `?locale=` override (handy for debugging) or
 * the browser language, expanding bare tags via {@link Intl.Locale.maximize}
 * (`en` -> US, `fr` -> FR). Returns "metric" only when we can positively
 * identify a non-imperial region; any uncertainty (no `navigator`, empty or
 * unparseable tag, region-less result) falls back to {@link DEFAULT_UNIT_SYSTEM}.
 * That imperial bias suits this dashboard's US-centric audience.
 */
export function localeDefaultUnits(): UnitSystem {
  if (typeof navigator === "undefined") return DEFAULT_UNIT_SYSTEM;

  const override =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("locale")
      : null;
  const tag = override ?? navigator.language;
  if (!tag) return DEFAULT_UNIT_SYSTEM;

  let region: string | undefined;
  try {
    region = new Intl.Locale(tag).maximize().region ?? undefined;
  } catch {
    return DEFAULT_UNIT_SYSTEM;
  }
  if (!region) return DEFAULT_UNIT_SYSTEM;

  return IMPERIAL_REGIONS.has(region.toUpperCase()) ? "imperial" : "metric";
}

/** Keys of TimeseriesPoint whose value is a number. */
type NumericTimeseriesKey = {
  [K in keyof TimeseriesPoint]: TimeseriesPoint[K] extends number ? K : never;
}[keyof TimeseriesPoint];

export interface UnitField {
  /** Numeric field on a timeseries point. */
  field: NumericTimeseriesKey;
  unit: string;
}

export interface MetricDef {
  label: string;
  imperial: UnitField;
  metric: UnitField;
}

export const METRICS = {
  waterTemp: {
    label: "Water temp",
    imperial: { field: "water_temp_f", unit: "°F" },
    metric: { field: "water_temp_c", unit: "°C" },
  },
  currentSpeed: {
    label: "Current",
    imperial: { field: "current_speed_kt", unit: "kt" },
    metric: { field: "current_speed_ms", unit: "m/s" },
  },
  waterLevel: {
    label: "Tide",
    imperial: { field: "water_level_ft", unit: "ft" },
    metric: { field: "water_level_m", unit: "m" },
  },
  windSpeed: {
    label: "Wind",
    imperial: { field: "wind_speed_kt", unit: "kt" },
    metric: { field: "wind_speed_ms", unit: "m/s" },
  },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

/** The field + unit a metric uses under a given unit system. */
export function unitField(metric: MetricDef, sys: UnitSystem): UnitField {
  return sys === "imperial" ? metric.imperial : metric.metric;
}

/** Read a metric's value off a timeseries point in the chosen unit system. */
export function readMetric(
  p: TimeseriesPoint,
  metric: MetricDef,
  sys: UnitSystem,
): number {
  return p[unitField(metric, sys).field];
}
