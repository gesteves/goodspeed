import { FieldFeedSchema, type FieldFeed } from "@/lib/schema";
import { readRaw } from "./raw";

/**
 * The SFBOFS field (gridded) feed source. Server-only.
 *
 * Best-effort: returns `null` (and logs) on any failure -- a missing or
 * malformed field feed must not break the dashboard, only hide the map.
 * Reads `GOODSPEED_FIELD_FEED_URL`; if unset, returns null silently.
 */
export async function fetchFieldFeed(): Promise<FieldFeed | null> {
  const url = process.env.GOODSPEED_FIELD_FEED_URL;
  if (!url) return null;
  try {
    return FieldFeedSchema.parse(await readRaw(url));
  } catch (err) {
    console.warn(
      "fetchFieldFeed failed; map will be hidden:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
