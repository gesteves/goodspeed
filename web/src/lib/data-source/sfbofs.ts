import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FeedSchema, type Feed } from "@/lib/schema";

/**
 * The SFBOFS feed source. Server-only -- reads `GOODSPEED_FEED_URL`, which may
 * be an http(s) URL (production S3/CDN), a file: URL, or a filesystem path
 * (local dev against the worker's `--out-dir` output).
 */

function feedUrl(): string {
  const url = process.env.GOODSPEED_FEED_URL;
  if (!url) {
    throw new Error(
      "GOODSPEED_FEED_URL is not set -- see web/.env.example",
    );
  }
  return url;
}

async function readRaw(src: string): Promise<unknown> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    // Server-side fetch: no S3 CORS concern. Cached for 5 min to match the
    // feed's own Cache-Control and the worker's ~4x/day cadence.
    const res = await fetch(src, { next: { revalidate: 300 } });
    if (!res.ok) {
      throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  const path = src.startsWith("file:") ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, "utf8"));
}

/** Fetch and validate the latest SFBOFS feed. */
export async function fetchFeed(): Promise<Feed> {
  return FeedSchema.parse(await readRaw(feedUrl()));
}
