import type { Config } from "@netlify/functions";

/**
 * Hourly prewarmer for the OG share image.
 *
 * `netlify/edge-functions/og.tsx` is slow on a cold render (Mapbox static
 * fetch + a few hundred SVG arrows go through `og_edge`'s WASM renderer), and
 * a cold path shows up whenever someone shares the dashboard right after the
 * cache expires. Fetching `/og.png` once an hour keeps the response warm.
 *
 * The OG response uses `Netlify-CDN-Cache-Control: ...durable...`, which
 * stores the cached body in Netlify's shared durable cache rather than per
 * edge-node, so a single fetch from this scheduled function is enough — every
 * edge serves from the same upstream cache. `s-maxage=3600` lines up with
 * this hourly cadence.
 */

const SITE_URL = process.env.URL;

export default async (): Promise<Response> => {
  if (!SITE_URL) {
    console.warn("og-warm: URL env var not set; skipping");
    return new Response("URL env not set", { status: 200 });
  }

  const target = new URL("/og.png", SITE_URL);
  const started = Date.now();
  try {
    const res = await fetch(target, {
      method: "GET",
      // Bypass any intermediate cache so we always re-populate the durable
      // entry on schedule, rather than getting a 304 from a stale edge view.
      headers: {
        "User-Agent": "goodspeed-og-prewarmer",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(25_000),
    });
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      console.warn(
        `og-warm: ${target} returned ${res.status} after ${elapsedMs}ms`,
      );
      return new Response(`upstream ${res.status}`, { status: 200 });
    }
    // Drain the body so the upstream completes its render before we return.
    const body = await res.arrayBuffer();
    console.log(
      `og-warm: ${target} ok in ${elapsedMs}ms (${body.byteLength} bytes)`,
    );
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(`og-warm: ${target} failed`, err);
    // A failed warm-up is never fatal; return 200 so Netlify doesn't mark the
    // scheduled invocation as a failure and retry-storm us.
    return new Response("error", { status: 200 });
  }
};

export const config: Config = {
  schedule: "@hourly",
};
