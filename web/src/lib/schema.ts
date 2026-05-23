import { z } from "zod";

/**
 * Runtime schema for the Goodspeed feed.
 *
 * This is a hand-maintained translation of the shared JSON Schema contract at
 * `../schema/sfbofs-sfb1204.schema.json`, which is the source of truth.
 * `schema.test.ts` fails the build if the two drift apart.
 */

export const TimeseriesPointSchema = z.object({
  t: z.iso.datetime(),
  source: z.enum(["nowcast", "forecast"]),
  water_temp_c: z.number(),
  water_temp_f: z.number(),
  current_u_ms: z.number(),
  current_v_ms: z.number(),
  current_speed_ms: z.number().nonnegative(),
  current_speed_kt: z.number().nonnegative(),
  current_bearing_deg: z.number().min(0).max(360),
  water_level_m: z.number(),
  water_level_ft: z.number(),
  salinity_psu: z.number(),
  wind_u_ms: z.number(),
  wind_v_ms: z.number(),
  wind_speed_ms: z.number().nonnegative(),
  wind_speed_kt: z.number().nonnegative(),
  wind_bearing_deg: z.number().min(0).max(360),
});

export const StationSchema = z.object({
  id: z.literal("SFB1204"),
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const ModelSchema = z.object({
  name: z.literal("SFBOFS"),
  cycle: z.iso.datetime(),
  fetched_at: z.iso.datetime(),
  source_files: z.array(z.string()).min(1),
  model_version: z.string(),
  notes: z.string().optional(),
});

export const FeedSchema = z.object({
  station: StationSchema,
  model: ModelSchema,
  timeseries: z.array(TimeseriesPointSchema).min(1),
});

export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;
export type Station = z.infer<typeof StationSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type Feed = z.infer<typeof FeedSchema>;
