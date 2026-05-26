/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  ARROW_HEAD_BACK,
  ARROW_HEAD_FRONT,
  ARROW_HEAD_HALF,
  ARROW_SHAFT_PAD,
  ARROW_SHAFT_WIDTH,
  SLACK_SPEED_KT,
} from "../../src/lib/map-constants.ts";

const WIDTH = 1200;
const HEIGHT = 630;

// Native dashboard view is 1.77 mi tall x 3.0 mi wide (extent.ts). OG is wider
// (1200/630 ≈ 1.905); anchor height and widen so the static map fills the OG
// canvas without padding -- a few extra arrows fall on the L/R edges.
const VIEW_HEIGHT_MILES = 1.77;
const EARTH_RADIUS_MI = 3958.7613;
const MI_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_MI) / 180;
const VIEW_WIDTH_MILES = VIEW_HEIGHT_MILES * (WIDTH / HEIGHT);


// Water-temperature color ramp. Anchors are the OKLCH stops in
// web/src/lib/colors.ts converted offline to sRGB; we interpolate in sRGB on
// the edge to avoid shipping an OKLCH conversion (imperceptible drift at
// arrow-pixel scale).
const STOPS: ReadonlyArray<{ c: number; r: number; g: number; b: number }> = [
  { c: 12.778, r: 0x53, g: 0xa3, b: 0xf2 },
  { c: 14.167, r: 0x3e, g: 0xcc, b: 0xe2 },
  { c: 15.556, r: 0xa1, g: 0xe4, b: 0xae },
  { c: 16.944, r: 0xff, g: 0xad, b: 0x5f },
  { c: 18.333, r: 0xf8, g: 0x6f, b: 0x3c },
];

function tempColor(tempC: number): string {
  const lo = STOPS[0].c;
  const hi = STOPS[STOPS.length - 1].c;
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

// Linear scaling kt -> px, matching MapLegend.arrowPx. ARROW_SCALE mirrors
// the live map's `arrowScale` knob -- the OG canvas is wider than the
// dashboard map so the arrows read a touch small at scale 1.
const ARROW_SCALE = 1.4;
function arrowPx(speedKt: number): number {
  const MIN = 14;
  const MAX = 32;
  return (MIN + Math.min(1, Math.max(0, speedKt / 2.5)) * (MAX - MIN)) *
    ARROW_SCALE;
}

// Minimal Zod schema -- only the fields the OG needs. Edge functions cannot
// import @/lib/schema (Astro alias) so the full schema lives in src/ for the
// dashboard; here we revalidate just enough to fail fast on a broken feed.
const FieldFeedLite = z.object({
  center: z.object({ lat: z.number(), lon: z.number() }),
  grid: z.object({
    lat: z.array(z.number()).min(1),
    lon: z.array(z.number()).min(1),
  }),
  t: z.array(z.string()).min(1),
  frames: z
    .array(
      z.object({
        current_speed_kt: z.array(z.number()),
        current_bearing_deg: z.array(z.number()),
        water_temp_c: z.array(z.number()),
      }),
    )
    .min(1),
});

type FieldFeedLite = z.infer<typeof FieldFeedLite>;

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

function pickNowFrame(times: readonly string[]): number {
  const now = Date.now();
  let best = 0;
  let bestDiff = Math.abs(Date.parse(times[0]) - now);
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(Date.parse(times[i]) - now);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

export default async function handler(_req: Request): Promise<Response> {
  const FEED = Deno.env.get("GOODSPEED_FIELD_FEED_URL");
  // Static Images API runs server-side (no Referer/Origin), so the
  // URL-restricted PUBLIC_MAPBOX_TOKEN 403s. This is a separate, unrestricted
  // token used only by this edge function.
  const TOKEN = Deno.env.get("MAPBOX_STATIC_TOKEN");
  if (!FEED) return notFound("GOODSPEED_FIELD_FEED_URL not set");
  if (!TOKEN) return notFound("MAPBOX_STATIC_TOKEN not set");

  let feed: FieldFeedLite;
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
    feed = FieldFeedLite.parse(await res.json());
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
  const frameIdx = pickNowFrame(feed.t);
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
  const c = toWorld(center.lon, center.lat);
  const project = (lon: number, lat: number) => {
    const p = toWorld(lon, lat);
    return { x: p.x - c.x + WIDTH / 2, y: p.y - c.y + HEIGHT / 2 };
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
  const arrows: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const { x, y } = project(grid.lon[i], grid.lat[i]);
    const sp = frame.current_speed_kt[i];
    const color = tempColor(frame.water_temp_c[i]);
    if (sp < SLACK_SPEED_KT) {
      arrows.push(
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3 * ARROW_SCALE}
          fill="none"
          stroke={color}
          strokeWidth={2 * ARROW_SCALE}
        />,
      );
      continue;
    }
    const len = arrowPx(sp);
    const tip = -len / 2;
    const bearing = frame.current_bearing_deg[i];
    const headHalf = ARROW_HEAD_HALF * ARROW_SCALE;
    const headBack = ARROW_HEAD_BACK * ARROW_SCALE;
    const headFront = ARROW_HEAD_FRONT * ARROW_SCALE;
    const shaftPad = ARROW_SHAFT_PAD * ARROW_SCALE;
    arrows.push(
      <g key={i} transform={`rotate(${bearing} ${x} ${y})`}>
        <line
          x1={x}
          y1={y + len / 2}
          x2={x}
          y2={y + tip + shaftPad}
          stroke={color}
          strokeWidth={ARROW_SHAFT_WIDTH * ARROW_SCALE}
          strokeLinecap="round"
        />
        <polygon
          points={`${x},${y + tip - headFront} ${x - headHalf},${y + tip + headBack} ${x + headHalf},${y + tip + headBack}`}
          fill={color}
        />
      </g>,
    );
  }

  const tree = (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: "#e9eef2",
      }}
    >
      <img
        src={mapboxUrl}
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {arrows}
      </svg>
    </div>
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

export const config = {
  path: "/og.png",
  cache: "manual",
};
