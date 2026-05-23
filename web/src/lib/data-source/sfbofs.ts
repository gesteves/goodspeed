import { FeedSchema, type Feed } from "@/lib/schema";
import { readRaw } from "./raw";

/**
 * The SFBOFS point feed source. Server-only -- reads `GOODSPEED_FEED_URL`,
 * which may be an http(s) URL (production: the Fly API app), a file: URL,
 * or a filesystem path (local dev against the API's `--out-dir` output).
 */

function feedUrl(): string {
  const url = process.env.GOODSPEED_FEED_URL;
  if (!url) {
    throw new Error("GOODSPEED_FEED_URL is not set -- see web/.env.example");
  }
  return url;
}

/** Fetch and validate the latest SFBOFS point feed. */
export async function fetchFeed(): Promise<Feed> {
  return FeedSchema.parse(await readRaw(feedUrl()));
}
