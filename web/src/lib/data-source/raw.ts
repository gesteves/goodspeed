import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Read a feed's raw JSON from either an http(s) URL or a filesystem path
 * (or `file:` URL). Shared by `fetchFeed` and `fetchFieldFeed`.
 *
 * Server-only -- pulls in `node:fs`; never import from a Client Component.
 *
 * Replaces Next.js's `fetch(url, { next: { revalidate: 300 } })` with an
 * in-memory TTL cache + single-flight guard. The endpoint that calls this
 * also sets `Netlify-CDN-Cache-Control: s-maxage=300`, so warm function
 * instances hit this cache and cold starts fall back to the edge cache.
 */

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export async function readRaw(src: string): Promise<unknown> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const now = Date.now();
    const cached = cache.get(src);
    if (cached && now - cached.at < TTL_MS) return cached.data;

    // Coalesce concurrent fetches for the same URL into one network round-trip.
    const existing = inFlight.get(src);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) {
          throw new Error(
            `Feed fetch failed: ${res.status} ${res.statusText}`,
          );
        }
        const data = await res.json();
        cache.set(src, { at: Date.now(), data });
        return data;
      } finally {
        inFlight.delete(src);
      }
    })();
    inFlight.set(src, promise);
    return promise;
  }
  const path = src.startsWith("file:") ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, "utf8"));
}
