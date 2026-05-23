import type { TimeseriesPoint } from "@/lib/schema";

/** A timeseries point with sane defaults; override only what a test cares about. */
export function makePoint(
  overrides: Partial<TimeseriesPoint> = {},
): TimeseriesPoint {
  return {
    t: "2026-05-20T03:00:00Z",
    source: "nowcast",
    water_temp_c: 13,
    water_temp_f: 55.4,
    current_u_ms: 0,
    current_v_ms: 0,
    current_speed_ms: 0,
    current_speed_kt: 0,
    current_bearing_deg: 0,
    water_level_m: 0,
    water_level_ft: 0,
    salinity_psu: 32,
    wind_u_ms: 0,
    wind_v_ms: 0,
    wind_speed_ms: 0,
    wind_speed_kt: 0,
    wind_bearing_deg: 0,
    ...overrides,
  };
}

/**
 * A series of `count` points at 6-min cadence starting at `start`. The builder
 * receives the index and minutes-from-start and returns field overrides.
 */
export function makeSeries(
  count: number,
  start: Date,
  build: (i: number, minutes: number) => Partial<TimeseriesPoint>,
): TimeseriesPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = i * 6;
    const t = new Date(start.getTime() + minutes * 60_000).toISOString();
    return makePoint({ t, ...build(i, minutes) });
  });
}
