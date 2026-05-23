import type { APIRoute } from "astro";
import { getDashboardData } from "@/lib/data-source";

export const prerender = false;

/**
 * SSR JSON endpoint used by the Dashboard island to refresh state every 60s
 * (replacing Next.js's `router.refresh()`).
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
export const GET: APIRoute = async () => {
  const { feed, field, fieldStatus } = await getDashboardData();
  return new Response(JSON.stringify({ feed, field, fieldStatus }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control":
        "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
};
