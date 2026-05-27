/**
 * Netlify Function that renders the Open Graph share image served at
 * `/og.png`. Each request paints:
 *
 *  1. A Mapbox Static Images basemap centred on the bay map's geographic
 *     center (same `center` the dashboard reads from the field feed).
 *  2. SVG current arrows over the in-water grid points of the most recent
 *     frame, coloured by water temperature against the same °C domain as
 *     the live map (`TEMP_DOMAIN_C` from `@/lib/colors`), with anchors
 *     pre-converted to sRGB and interpolated in sRGB here.
 *
 * Why a Netlify Function and not an Edge Function: Netlify's `durable`
 * cache directive (see the `Netlify-CDN-Cache-Control` header below) is a
 * Functions-only feature. From an edge function it's a no-op; here it
 * means one render globally per `s-maxage` window, not one per edge node.
 *
 * Why `.mts` + `React.createElement` (`h`) instead of `.tsx` JSX:
 * `netlify dev`'s local runner loads `.tsx` functions through Node's CJS
 * loader (despite package.json `"type": "module"`). In CJS mode,
 * `export default` becomes `module.exports.default`, so Netlify's v2
 * handler detection misfires and `@vercel/og`'s `new URL("./yoga.wasm",
 * import.meta.url)` throws. `.mts` forces native ESM loading, fixing
 * both. The tradeoff is `createElement` calls in place of JSX -- the
 * tree is small enough that the readability cost is minor.
 *
 * Shared with the live map (`src/components/map/BayMap.tsx`):
 *   - View height + Earth/lat conversions from `@/components/map/extent`
 *   - Arrow geometry + `arrowPx` curve from `@/lib/map-constants`
 *   - Frame "closest to now" picker from `@/lib/derive/now`
 *   - Field-feed schema from `@/lib/schema`
 *   - Temperature clamp domain from `@/lib/colors`
 *
 * Intentionally duplicated here:
 *   - sRGB color stops + interpolator: the canonical `tempColor()` returns
 *     `oklch(...)` strings, which satori/resvg do not reliably honor as
 *     SVG `fill` attribute values. We interpolate in sRGB here; the slight
 *     perceptual drift at arrow-pixel scale is acceptable.
 *   - Mercator projection (`toWorld`/`project`): the live map uses Mapbox
 *     GL's `.project()`, which requires a runtime Mapbox instance.
 *
 * Cache headers: short browser TTL (60s) so a missed cycle isn't pinned,
 * but a 1-hour shared `durable` cache with a 24-hour stale-while-revalidate
 * window so most social-card crawlers hit the cache rather than the live
 * function.
 */
import type { Config } from "@netlify/functions";
import { ImageResponse } from "@vercel/og";
import { createElement as h, type ReactNode } from "react";
import { TEMP_DOMAIN_C } from "@/lib/colors";
import { nearestTimeIndex } from "@/lib/derive/now";
import { MI_PER_DEG_LAT, VIEW_HEIGHT_MILES } from "@/components/map/extent";
import {
  ARROW_HEAD_BACK,
  ARROW_HEAD_FRONT,
  ARROW_HEAD_HALF,
  ARROW_SHAFT_PAD,
  ARROW_SHAFT_WIDTH,
  arrowPx,
  SLACK_SPEED_KT,
} from "@/lib/map-constants";
import { FieldFeedSchema } from "@/lib/schema";

const WIDTH = 1200;
const HEIGHT = 630;

// Native dashboard view is 1.77 mi tall x 3.0 mi wide. OG is wider
// (1200/630 ≈ 1.905); anchor on the shared height and widen so the static
// map fills the OG canvas without padding -- a few extra arrows fall on
// the L/R edges.
const VIEW_WIDTH_MILES = VIEW_HEIGHT_MILES * (WIDTH / HEIGHT);

// Water-temperature color ramp. Anchors are the OKLCH stops in
// `@/lib/colors` converted offline to sRGB; we interpolate in sRGB here
// to avoid shipping an OKLCH conversion (imperceptible drift at
// arrow-pixel scale) and to dodge satori/resvg's flaky support for
// oklch() inside SVG `fill` attributes.
const STOPS: ReadonlyArray<{ c: number; r: number; g: number; b: number }> = [
  { c: 12.778, r: 0x53, g: 0xa3, b: 0xf2 },
  { c: 14.167, r: 0x3e, g: 0xcc, b: 0xe2 },
  { c: 15.556, r: 0xa1, g: 0xe4, b: 0xae },
  { c: 16.944, r: 0xff, g: 0xad, b: 0x5f },
  { c: 18.333, r: 0xf8, g: 0x6f, b: 0x3c },
];

function tempColor(tempC: number): string {
  const [lo, hi] = TEMP_DOMAIN_C;
  const c = Math.min(hi, Math.max(lo, tempC));
  let i = 0;
  while (i < STOPS.length - 1 && c > STOPS[i + 1].c) i++;
  if (i >= STOPS.length - 1) {
    const s = STOPS[STOPS.length - 1];
    return `rgb(${s.r},${s.g},${s.b})`;
  }
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = (c - a.c) / (b.c - a.c);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

// The OG canvas is wider than the dashboard map, so the shared `arrowPx`
// curve reads a touch small at scale 1; bump it here.
const ARROW_SCALE = 1.4;

function notFound(reason: string): Response {
  console.warn("og: not available:", reason);
  return new Response("Not Found", {
    status: 404,
    headers: {
      "cache-control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, s-maxage=60",
    },
  });
}

export default async function handler(_req: Request): Promise<Response> {
  const FEED = process.env.GOODSPEED_FIELD_FEED_URL;
  // Static Images API runs server-side (no Referer/Origin), so the
  // URL-restricted PUBLIC_MAPBOX_TOKEN 403s. This is a separate,
  // unrestricted token used only by this function.
  const TOKEN = process.env.MAPBOX_STATIC_TOKEN;
  if (!FEED) return notFound("GOODSPEED_FIELD_FEED_URL not set");
  if (!TOKEN) return notFound("MAPBOX_STATIC_TOKEN not set");

  let feed;
  try {
    const res = await fetch(FEED, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error("og: field feed status", res.status);
      return new Response("Bad Gateway", {
        status: 502,
        headers: {
          "cache-control": "public, max-age=30",
          "Netlify-CDN-Cache-Control": "public, s-maxage=30",
        },
      });
    }
    feed = FieldFeedSchema.parse(await res.json());
  } catch (err) {
    console.error("og: field feed fetch/parse failed:", err);
    return new Response("Bad Gateway", {
      status: 502,
      headers: {
        "cache-control": "public, max-age=30",
        "Netlify-CDN-Cache-Control": "public, s-maxage=30",
      },
    });
  }

  const { center, grid } = feed;
  const frameIdx = nearestTimeIndex(feed.t);
  const frame = feed.frames[Math.min(frameIdx, feed.frames.length - 1)];

  // Pick a fractional zoom so VIEW_WIDTH_MILES at the center latitude fills
  // exactly WIDTH px in Mapbox's 512-tile Mercator world. Then project each
  // grid point in the same coordinate system -- arrows land in lockstep with
  // the static-image background.
  const miPerDegLon = MI_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const degLon = VIEW_WIDTH_MILES / miPerDegLon;
  const worldPx = WIDTH / (degLon / 360);
  const zoom = Math.log2(worldPx / 512);

  const worldSize = 512 * 2 ** zoom;
  const toWorld = (lon: number, lat: number) => {
    const lr = (lat * Math.PI) / 180;
    return {
      x: ((lon + 180) / 360) * worldSize,
      y:
        ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) *
        worldSize,
    };
  };
  const cWorld = toWorld(center.lon, center.lat);
  const project = (lon: number, lat: number) => {
    const p = toWorld(lon, lat);
    return { x: p.x - cWorld.x + WIDTH / 2, y: p.y - cWorld.y + HEIGHT / 2 };
  };

  const mapboxUrl =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `${center.lon},${center.lat},${zoom.toFixed(4)}/` +
    `${WIDTH}x${HEIGHT}@2x?access_token=${TOKEN}`;

  // The schema enforces .min(1) on each array but not parity across them. If a
  // malformed feed has shorter frame arrays than the grid, fall back to a
  // basemap-only image instead of letting an `undefined` reach the SVG
  // (which would 500 the function).
  const n = Math.min(
    grid.lat.length,
    grid.lon.length,
    frame.current_speed_kt.length,
    frame.current_bearing_deg.length,
    frame.water_temp_c.length,
  );
  const arrows: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const { x, y } = project(grid.lon[i], grid.lat[i]);
    const sp = frame.current_speed_kt[i];
    const color = tempColor(frame.water_temp_c[i]);
    if (sp < SLACK_SPEED_KT) {
      arrows.push(
        h("circle", {
          key: i,
          cx: x,
          cy: y,
          r: 3 * ARROW_SCALE,
          fill: "none",
          stroke: color,
          strokeWidth: 2 * ARROW_SCALE,
        }),
      );
      continue;
    }
    const len = arrowPx(sp) * ARROW_SCALE;
    const tip = -len / 2;
    const bearing = frame.current_bearing_deg[i];
    const headHalf = ARROW_HEAD_HALF * ARROW_SCALE;
    const headBack = ARROW_HEAD_BACK * ARROW_SCALE;
    const headFront = ARROW_HEAD_FRONT * ARROW_SCALE;
    const shaftPad = ARROW_SHAFT_PAD * ARROW_SCALE;
    arrows.push(
      h(
        "g",
        { key: i, transform: `rotate(${bearing} ${x} ${y})` },
        h("line", {
          x1: x,
          y1: y + len / 2,
          x2: x,
          y2: y + tip + shaftPad,
          stroke: color,
          strokeWidth: ARROW_SHAFT_WIDTH * ARROW_SCALE,
          strokeLinecap: "round",
        }),
        h("polygon", {
          points:
            `${x},${y + tip - headFront} ` +
            `${x - headHalf},${y + tip + headBack} ` +
            `${x + headHalf},${y + tip + headBack}`,
          fill: color,
        }),
      ),
    );
  }

  const tree = h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: "#e9eef2",
      },
    },
    h("img", {
      src: mapboxUrl,
      width: WIDTH,
      height: HEIGHT,
      style: { position: "absolute", top: 0, left: 0 },
    }),
    h(
      "svg",
      {
        width: WIDTH,
        height: HEIGHT,
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
        xmlns: "http://www.w3.org/2000/svg",
        style: { position: "absolute", top: 0, left: 0 },
      },
      arrows,
    ),
  );

  return new ImageResponse(tree, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=60",
      "Netlify-CDN-Cache-Control":
        "public, durable, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export const config: Config = {
  path: "/og.png",
};
