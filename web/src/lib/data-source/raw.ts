import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Read a feed's raw JSON from either an http(s) URL or a filesystem path
 * (or `file:` URL). Shared by `fetchFeed` and `fetchFieldFeed`.
 *
 * Server-only -- pulls in `node:fs`; never import from a Client Component.
 */
export async function readRaw(src: string): Promise<unknown> {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    // Server-side fetch: no CORS concern. Cached for 5 min to match the
    // feed's own Cache-Control and the API's ~hourly cadence.
    const res = await fetch(src, { next: { revalidate: 300 } });
    if (!res.ok) {
      throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  const path = src.startsWith("file:") ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, "utf8"));
}
