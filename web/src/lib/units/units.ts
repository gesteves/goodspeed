import type { TimeseriesPoint } from "@/lib/schema";

/**
 * Unit handling. The feed already carries both unit systems, so switching
 * units is just choosing which field to read -- there is no conversion math.
 */

export type UnitSystem = "imperial" | "metric";

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial";

export interface UnitField {
  /** Numeric field on a timeseries point. */
  field: keyof TimeseriesPoint;
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
  return p[unitField(metric, sys).field] as number;
}
