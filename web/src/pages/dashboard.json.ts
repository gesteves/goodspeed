import type { APIRoute } from "astro";
import { getDashboardData } from "@/lib/data-source";

/**
 * SSR JSON endpoint that the Dashboard island polls every 60s to refresh
 * state without a page navigation.
 *
 * The path is `/dashboard.json` (NOT `/api/dashboard.json`) on purpose: the
 * `/api/event` rewrite in `netlify.toml` forwards anything under `/api/` to
 * plausible.io, so a function route there would shadow Plausible's collector.
 *
 * Cache headers: the browser must always revalidate (no stale local copy is
 * OK), but Netlify's edge CDN may serve the response for up to 5 minutes
 * (matching the upstream feed's cadence), with a 10-min stale-while-revalidate
 * window so a momentarily unavailable origin doesn't break the dashboard.
 */

// Per-fetch timeouts in raw.ts already cap each upstream at 3.5s, but the
// point feed and the field feed are awaited concurrently and could
// theoretically stack. This hard cap keeps a worst-case endpoint within the
// Netlify function budget and signals the client to back off cleanly.
const ENDPOINT_TIMEOUT_MS = 20_000;

class EndpointTimeout extends Error {
  constructor() {
    super("dashboard.json overall timeout");
  }
}

export const GET: APIRoute = async () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EndpointTimeout()), ENDPOINT_TIMEOUT_MS);
  });
  try {
    const { feed, field, fieldStatus } = await Promise.race([
      getDashboardData(),
      timeout,
    ]);
    return new Response(JSON.stringify({ feed, field, fieldStatus }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("dashboard.json: data fetch failed", err);
    const status = err instanceof EndpointTimeout ? 504 : 502;
    return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
