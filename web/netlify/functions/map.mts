/**
 * Netlify Function serving the high-resolution bay-map stills under
 * `/images/map/*.png`:
 *
 *   /images/map/current.png       -- the current conditions (frame nearest "now")
 *   /images/map/today/HHMM.png    -- HH:MM today, in America/Los_Angeles
 *   /images/map/tomorrow/HHMM.png -- HH:MM tomorrow, in America/Los_Angeles
 *
 * Each renders the same image the local CLI (`scripts/map-image.ts`) writes --
 * a 2560x1510 PNG with the temperature-coloured current arrows, the swim-start
 * ring, the swim-finish marker, on-map labels, and the legend -- via the shared
 * `@/lib/map-image/render` builder. Optional `?theme=dark` and `?units=metric`
 * query params match the CLI's flags.
 *
 * Returns 404 when the requested time falls outside the field feed's coverage
 * window (no data for that time), or when the path/HHMM isn't recognised.
 *
 * `/images/og.png` is owned by `og.mts` -- a separate, smaller social-share
 * crop with its own path.
 *
 * Why a Function (and `.mts` + `createElement`) rather than an Astro route or a
 * `.tsx`: same reasons as `og.mts` -- the `durable` CDN-cache directive is a
 * Functions-only feature, and `netlify dev` loads `.tsx` as CJS, which breaks
 * `@vercel/og`'s `import.meta.url` wasm lookup. The shared builder uses
 * `createElement`, so there's no JSX here either.
 */
import type { Config } from "@netlify/functions";
import { ImageResponse } from "@vercel/og";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DISPLAY_TZ } from "@/lib/constants";
import { nearestTimeIndex } from "@/lib/derive/now";
import { buildMapImage, type MapImageTheme } from "@/lib/map-image/render";
import { FieldFeedSchema } from "@/lib/schema";
import type { UnitSystem } from "@/lib/units/units";

function notFound(reason: string): Response {
  console.warn("images: not available:", reason);
  return new Response("Not Found", {
    status: 404,
    headers: {
      "cache-control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, s-maxage=60",
    },
  });
}

function badGateway(reason: string): Response {
  console.error("images:", reason);
  return new Response("Bad Gateway", {
    status: 502,
    headers: {
      "cache-control": "public, max-age=30",
      "Netlify-CDN-Cache-Control": "public, s-maxage=30",
    },
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** HH:MM on the given Pacific calendar date (`yyyy-MM-dd`) -> UTC instant. */
function instantAt(datePT: string, hh: number, mm: number): Date {
  return fromZonedTime(`${datePT}T${pad(hh)}:${pad(mm)}:00`, DISPLAY_TZ);
}

/**
 * Resolve the request path to a UTC instant. Recognises:
 *   .../current        -> now
 *   .../today/HHMM     -> HH:MM today (Pacific)
 *   .../tomorrow/HHMM  -> HH:MM tomorrow (Pacific)
 * Returns null for anything else, or an out-of-range HHMM.
 */
function targetFromPath(pathname: string): Date | null {
  const segs = pathname.replace(/\.png$/, "").split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  const day = segs[segs.length - 2] ?? "";

  if (last === "current") return new Date();

  if ((day === "today" || day === "tomorrow") && /^\d{4}$/.test(last)) {
    const hh = Number(last.slice(0, 2));
    const mm = Number(last.slice(2, 4));
    if (hh > 23 || mm > 59) return null;
    // Resolve "today"/"tomorrow" against the Pacific calendar date; add the day
    // at noon so a DST transition can't shift it onto the wrong date.
    const todayPT = formatInTimeZone(new Date(), DISPLAY_TZ, "yyyy-MM-dd");
    const datePT =
      day === "tomorrow"
        ? formatInTimeZone(addDays(instantAt(todayPT, 12, 0), 1), DISPLAY_TZ, "yyyy-MM-dd")
        : todayPT;
    const d = instantAt(datePT, hh, mm);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export default async function handler(req: Request): Promise<Response> {
  const FEED = process.env.GOODSPEED_FIELD_FEED_URL;
  // Static Images API runs server-side (no Referer/Origin), so the
  // URL-restricted PUBLIC_MAPBOX_TOKEN 403s -- this is a separate, unrestricted
  // token (the same one og.mts uses).
  const TOKEN = process.env.MAPBOX_STATIC_TOKEN;
  if (!FEED) return notFound("GOODSPEED_FIELD_FEED_URL not set");
  if (!TOKEN) return notFound("MAPBOX_STATIC_TOKEN not set");

  const url = new URL(req.url);
  const target = targetFromPath(url.pathname);
  if (!target) return notFound(`unrecognized image path: "${url.pathname}"`);

  const theme: MapImageTheme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const units: UnitSystem = url.searchParams.get("units") === "metric" ? "metric" : "imperial";

  let feed;
  try {
    const res = await fetch(FEED, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return badGateway(`field feed status ${res.status}`);
    feed = FieldFeedSchema.parse(await res.json());
  } catch (err) {
    return badGateway(`field feed fetch/parse failed: ${err instanceof Error ? err.message : err}`);
  }

  // 404 if the requested time isn't covered by the feed -- there is no data for
  // it. (Within the span, the nearest frame is the data for that time.)
  const t = target.getTime();
  const spanStart = new Date(feed.t[0]).getTime();
  const spanEnd = new Date(feed.t[feed.t.length - 1]).getTime();
  if (t < spanStart || t > spanEnd) {
    return notFound(
      `requested time ${formatInTimeZone(target, DISPLAY_TZ, "yyyy-MM-dd HH:mm zzz")} is outside the feed coverage`,
    );
  }

  const frameIdx = nearestTimeIndex(feed.t, target);
  const { tree, width, height } = buildMapImage(feed, frameIdx, { token: TOKEN, theme, units });

  return new ImageResponse(tree, {
    width,
    height,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=60",
      "Netlify-CDN-Cache-Control":
        "public, durable, s-maxage=360, stale-while-revalidate=86400",
    },
  });
}

export const config: Config = {
  path: ["/images/map/current.png", "/images/map/today/:slug", "/images/map/tomorrow/:slug"],
};
