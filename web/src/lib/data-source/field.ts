import { env } from "@/lib/env";
import { FieldFeedSchema, type FieldFeed } from "@/lib/schema";
import { readRaw } from "./raw";

export type FieldStatus = "ok" | "unconfigured" | "failed" | "loading";

export interface FieldFeedResult {
  feed: FieldFeed | null;
  status: FieldStatus;
}

/**
 * The SFBOFS field (gridded) feed source. Server-only.
 *
 * Best-effort: distinguishes between "not configured" (no URL set; the dev
 * hasn't wired the map up at all) and "configured but the fetch failed"
 * (intermittent NOAA / API outage). The dashboard renders a brief notice in
 * the second case so users know a feature is degraded rather than missing.
 */
export async function fetchFieldFeed(): Promise<FieldFeedResult> {
  const url = env.GOODSPEED_FIELD_FEED_URL;
  if (!url) return { feed: null, status: "unconfigured" };
  try {
    return { feed: FieldFeedSchema.parse(await readRaw(url)), status: "ok" };
  } catch (err) {
    console.warn(
      "fetchFieldFeed failed; map will show an unavailable notice:",
      err instanceof Error ? err.message : err,
    );
    return { feed: null, status: "failed" };
  }
}
