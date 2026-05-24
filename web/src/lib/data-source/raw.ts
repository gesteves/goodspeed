import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Read a feed's raw JSON from an http(s) URL, a `file:` URL, or a filesystem
 * path. Shared by `fetchFeed` and `fetchFieldFeed`.
 *
 * Server-only -- pulls in `node:fs`; never import from a Client Component.
 *
 * For http(s) sources, a per-process in-memory cache (5 min TTL) plus a
 * single-flight guard avoids hammering upstream during traffic bursts on a
 * single warm function instance; Netlify's edge `s-maxage=300` handles the
 * cross-instance / cold-start case. On upstream failure we fall back to the
 * last successful response, even if it is past its TTL, so a transient outage
 * never blanks the dashboard. The unbounded `Map` is fine in practice: callers
 * pass a small fixed set of URLs (the point feed + the field feed).
 */

const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

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
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Feed fetch timed out")),
        FETCH_TIMEOUT_MS,
      );
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(
            `Feed fetch failed: ${res.status} ${res.statusText}`,
          );
        }
        const data = await res.json();
        cache.set(src, { at: Date.now(), data });
        return data;
      } catch (err) {
        // Upstream is unhealthy: prefer the last good response (even past TTL)
        // over breaking the page. Only propagate the error if we have nothing
        // to serve.
        const stale = cache.get(src);
        if (stale) {
          console.warn(
            `readRaw: upstream fetch failed; serving stale cache (age ${Math.round((Date.now() - stale.at) / 1000)}s): ${
              err instanceof Error ? err.message : err
            }`,
          );
          return stale.data;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
        inFlight.delete(src);
      }
    })();
    inFlight.set(src, promise);
    return promise;
  }
  const path = src.startsWith("file:") ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, "utf8"));
}
