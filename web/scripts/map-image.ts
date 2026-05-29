/**
 * Local CLI: render a high-resolution still of the bay map at a given
 * date/time, for embedding in a blog post (e.g. the forecast conditions at the
 * race start).
 *
 * It is the OG share renderer (`netlify/functions/og.mts`), generalized:
 *   - an arbitrary timestamp (parsed from natural language) instead of "now",
 *   - the dashboard's true view extent (3.0 mi x 1.77 mi) instead of OG's
 *     wider crop,
 *   - 2x the resolution -- the maximum Mapbox Static Images allows (1280 logical
 *     @2x = 2560 px wide),
 *   - plus the three overlays OG omits: the water-temperature legend, the swim
 *     start ring, and the swim finish marker (both with labels).
 *
 * Local-only tooling, run via tsx -- not part of the Astro app, so it reads
 * `process.env` directly (loading `web/.env.local` itself) rather than going
 * through `astro:env`. It reuses the same shared geometry / schema / frame
 * picker the live map and OG image use, so it can't drift from them.
 *
 *   npm run map-image -- "8:30am June 8 2026"
 *   npm run map-image                      # prompts; blank = current conditions
 *   npm run map-image -- --theme dark --units metric --out start.png "race start"
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@vercel/og";
import { faLocationCrosshairs } from "@fortawesome/pro-regular-svg-icons";
import * as chrono from "chrono-node";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createElement as h, type ReactNode } from "react";
import { TEMP_DOMAIN_C, tempDomainLabels } from "../src/lib/colors";
import { DISPLAY_TZ } from "../src/lib/constants";
import { nearestTimeIndex } from "../src/lib/derive/now";
import { MI_PER_DEG_LAT, VIEW_HEIGHT_MILES, VIEW_WIDTH_MILES } from "../src/components/map/extent";
import {
  ARROW_HEAD_BACK,
  ARROW_HEAD_FRONT,
  ARROW_HEAD_HALF,
  ARROW_SHAFT_PAD,
  ARROW_SHAFT_WIDTH,
  arrowPx,
  FINISH_LAT,
  FINISH_LON,
  SLACK_SPEED_KT,
  START_LAT,
  START_LON,
} from "../src/lib/map-constants";
import { FieldFeedSchema } from "../src/lib/schema";
import type { UnitSystem } from "../src/lib/units/units";

// ---- Resolution --------------------------------------------------------------
// Mapbox Static Images caps a single image at 1280x1280 logical px; `@2x`
// doubles the pixel density (not the geographic extent), so the real ceiling is
// 2560 px. We request at the logical size and render the output at 2x.
const LOGICAL_W = 1280;
const LOGICAL_H = Math.round(LOGICAL_W * (VIEW_HEIGHT_MILES / VIEW_WIDTH_MILES));
const SCALE = 2;
const OUT_W = LOGICAL_W * SCALE; // 2560
const OUT_H = LOGICAL_H * SCALE; // 1510

// Arrows are drawn larger than the live map's 1:1 geometry: at this resolution
// the dashboard-scale arrows read small against the wide grid. This boost is
// applied on top of SCALE; tune with --arrow-scale.
const DEFAULT_ARROW_BOOST = 1.25;

// ---- Theme palette -----------------------------------------------------------
// The static render has no CSS custom properties, so concrete colors stand in
// for the dashboard's --text / --surface / --border tokens, per basemap theme.
interface Palette {
  style: string; // Mapbox style id
  ink: string; // marker + ring stroke (stands in for --text)
  label: string; // label text (stands in for --text-muted)
  halo: string; // label text-shadow halo (stands in for --surface)
  surface: string; // legend background
  border: string; // legend / bar border
}
const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    style: "light-v11",
    ink: "#1b232c",
    label: "#3a4654",
    halo: "rgba(255,255,255,0.85)",
    surface: "rgba(248,250,252,0.92)",
    border: "rgba(0,0,0,0.12)",
  },
  dark: {
    style: "dark-v11",
    ink: "#e7edf3",
    label: "#c2ccd6",
    halo: "rgba(10,14,18,0.85)",
    surface: "rgba(22,28,34,0.92)",
    border: "rgba(255,255,255,0.16)",
  },
};

// ---- Water-temperature color ramp (sRGB) ------------------------------------
// `@/lib/colors` returns oklch() strings, which resvg/satori don't reliably
// honor as SVG fill / CSS gradient values. These are the same OKLCH stops
// converted to sRGB (identical to the set used by og.mts).
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

/** Evenly-spaced sRGB colors across the domain, for the legend gradient. */
function tempColorStops(n: number): string[] {
  const [lo, hi] = TEMP_DOMAIN_C;
  return Array.from({ length: n }, (_, i) => tempColor(lo + ((hi - lo) * i) / (n - 1)));
}

// ---- Geometry (shared with BayMap.tsx) --------------------------------------
function offsetLonByMeters(lat: number, lon: number, meters: number): number {
  return lon + meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Edge of the start ring sits 1.5 mi from the finish (same as the live map).
const START_RADIUS_M =
  haversineMeters(START_LAT, START_LON, FINISH_LAT, FINISH_LON) - 1.5 * 1609.344;

// Font Awesome "location-crosshairs" glyph for the finish marker.
const [FINISH_ICON_W, FINISH_ICON_H, , , FINISH_ICON_RAW] = faLocationCrosshairs.icon;
const FINISH_ICON_PATH = Array.isArray(FINISH_ICON_RAW) ? FINISH_ICON_RAW[0] : FINISH_ICON_RAW;

// ---- Arg parsing -------------------------------------------------------------
interface Args {
  when: string; // free-text date/time ("" => prompt or now)
  out: string | null;
  theme: "light" | "dark";
  units: UnitSystem;
  feed: string | null;
  token: string | null;
  arrowBoost: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    when: "",
    out: null,
    theme: "light",
    units: "imperial",
    feed: null,
    token: null,
    arrowBoost: DEFAULT_ARROW_BOOST,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i] ?? null;
    else if (a === "--theme") args.theme = argv[++i] === "dark" ? "dark" : "light";
    else if (a === "--units") args.units = argv[++i] === "metric" ? "metric" : "imperial";
    else if (a === "--feed") args.feed = argv[++i] ?? null;
    else if (a === "--token") args.token = argv[++i] ?? null;
    else if (a === "--arrow-scale") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error("--arrow-scale must be a positive number");
      args.arrowBoost = v;
    } else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  args.when = positional.join(" ").trim();
  return args;
}

// ---- .env.local loader (dependency-free) ------------------------------------
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(SCRIPT_DIR, "..");
// Default output folder (gitignored). Overridden by --out.
const OUTPUT_DIR = resolve(WEB_DIR, "map-exports");

async function loadEnvLocal(): Promise<void> {
  let text: string;
  try {
    text = await readFile(resolve(WEB_DIR, ".env.local"), "utf8");
  } catch {
    return; // no .env.local -- rely on the ambient environment
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ---- Natural-language date -> UTC instant -----------------------------------
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse free-text `input` to a UTC instant. A bare wall-clock time ("8:30am
 * June 8") is interpreted in America/Los_Angeles (the race tz), DST-correct and
 * independent of the machine's timezone. An explicit offset in the text is
 * honored as-is. Empty input => now.
 */
function parseWhen(input: string): Date {
  if (!input) return new Date();
  const results = chrono.parse(input, new Date(), { forwardDate: true });
  const r = results[0];
  if (!r) throw new Error(`Could not understand date/time: "${input}"`);
  // Explicit timezone in the text -> chrono already resolved the absolute instant.
  if (r.start.isCertain("timezoneOffset")) return r.date();
  // Otherwise treat the parsed wall-clock components as Pacific time.
  const c = r.start;
  const y = c.get("year");
  const mo = c.get("month");
  const d = c.get("day");
  if (y == null || mo == null || d == null) {
    throw new Error(`Could not understand date/time: "${input}"`);
  }
  const hh = c.get("hour") ?? 12;
  const mm = c.get("minute") ?? 0;
  const wall = `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00`;
  return fromZonedTime(wall, DISPLAY_TZ);
}

// ---- Mercator projection (shared math with og.mts) --------------------------
interface Pt {
  x: number;
  y: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvLocal();

  const feedUrl = args.feed ?? process.env.GOODSPEED_FIELD_FEED_URL;
  const token = args.token ?? process.env.MAPBOX_STATIC_TOKEN;
  if (!feedUrl) {
    throw new Error(
      "GOODSPEED_FIELD_FEED_URL is not set (web/.env.local or --feed). " +
        "Point it at the deployed /field-latest.json or a local field feed file.",
    );
  }
  if (!token) {
    throw new Error(
      "MAPBOX_STATIC_TOKEN is not set (web/.env.local or --token). " +
        "Use an unrestricted Mapbox token (the static API sends no Referer).",
    );
  }

  // Prompt for the time only when none was passed on the command line.
  let when = args.when;
  if (!when) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    when = (await rl.question("Date/time (blank = current conditions): ")).trim();
    rl.close();
  }
  const target = parseWhen(when);

  // Fetch (http[s]) or read (file path) the field feed.
  let raw: unknown;
  if (/^https?:\/\//.test(feedUrl)) {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Field feed fetch failed: HTTP ${res.status}`);
    raw = await res.json();
  } else {
    const path = feedUrl.startsWith("file://") ? fileURLToPath(feedUrl) : resolve(WEB_DIR, feedUrl);
    raw = JSON.parse(await readFile(path, "utf8"));
  }
  const feed = FieldFeedSchema.parse(raw);
  const { center, grid } = feed;

  // Pick the frame closest to the target instant.
  const frameIdx = Math.min(nearestTimeIndex(feed.t, target), feed.frames.length - 1);
  const frame = feed.frames[frameIdx];
  const matchedIso = feed.t[frameIdx];
  const fmt = "EEE MMM d, yyyy h:mm a zzz";
  console.log(`Requested:  ${formatInTimeZone(target, DISPLAY_TZ, fmt)}`);
  console.log(
    `Using frame: ${formatInTimeZone(new Date(matchedIso), DISPLAY_TZ, fmt)} (${feed.source[frameIdx]})`,
  );
  const spanStart = new Date(feed.t[0]).getTime();
  const spanEnd = new Date(feed.t[feed.t.length - 1]).getTime();
  if (target.getTime() < spanStart || target.getTime() > spanEnd) {
    console.warn(
      "⚠ Requested time is outside the feed's coverage; clamped to the nearest available frame.",
    );
  }

  // Zoom so VIEW_WIDTH_MILES fills the LOGICAL width at the center latitude;
  // then project everything into the 2x output space.
  const miPerDegLon = MI_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const degLon = VIEW_WIDTH_MILES / miPerDegLon;
  const worldPx = LOGICAL_W / (degLon / 360);
  const zoom = Math.log2(worldPx / 512);

  const worldSize = 512 * 2 ** zoom * SCALE;
  const toWorld = (lon: number, lat: number): Pt => {
    const lr = (lat * Math.PI) / 180;
    return {
      x: ((lon + 180) / 360) * worldSize,
      y: ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * worldSize,
    };
  };
  const cWorld = toWorld(center.lon, center.lat);
  const project = (lon: number, lat: number): Pt => {
    const p = toWorld(lon, lat);
    return { x: p.x - cWorld.x + OUT_W / 2, y: p.y - cWorld.y + OUT_H / 2 };
  };

  const pal = PALETTES[args.theme];
  const mapboxUrl =
    `https://api.mapbox.com/styles/v1/mapbox/${pal.style}/static/` +
    `${center.lon},${center.lat},${zoom.toFixed(4)}/` +
    `${LOGICAL_W}x${LOGICAL_H}@2x?access_token=${token}`;

  // ---- Current arrows (ported from og.mts, scaled by SCALE) ----
  const n = Math.min(
    grid.lat.length,
    grid.lon.length,
    frame.current_speed_kt.length,
    frame.current_bearing_deg.length,
    frame.water_temp_c.length,
  );
  const aScale = SCALE * args.arrowBoost;
  const svgChildren: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const { x, y } = project(grid.lon[i], grid.lat[i]);
    const sp = frame.current_speed_kt[i];
    const color = tempColor(frame.water_temp_c[i]);
    if (sp < SLACK_SPEED_KT) {
      svgChildren.push(
        h("circle", { key: `a${i}`, cx: x, cy: y, r: 3 * aScale, fill: "none", stroke: color, strokeWidth: 2 * aScale }),
      );
      continue;
    }
    const len = arrowPx(sp) * aScale;
    const tip = -len / 2;
    const bearing = frame.current_bearing_deg[i];
    const headHalf = ARROW_HEAD_HALF * aScale;
    const headBack = ARROW_HEAD_BACK * aScale;
    const headFront = ARROW_HEAD_FRONT * aScale;
    const shaftPad = ARROW_SHAFT_PAD * aScale;
    svgChildren.push(
      h(
        "g",
        { key: `a${i}`, transform: `rotate(${bearing} ${x} ${y})` },
        h("line", {
          x1: x,
          y1: y + len / 2,
          x2: x,
          y2: y + tip + shaftPad,
          stroke: color,
          strokeWidth: ARROW_SHAFT_WIDTH * aScale,
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

  // ---- Swim start ring (dashed circle, faded toward the ocean side) ----
  const startPx = project(START_LON, START_LAT);
  const startEast = project(offsetLonByMeters(START_LAT, START_LON, START_RADIUS_M), START_LAT);
  const ringR = Math.max(Math.abs(startEast.x - startPx.x), 36 * SCALE);
  svgChildren.push(
    h(
      "defs",
      { key: "defs" },
      h(
        "linearGradient",
        {
          id: "startRing",
          gradientUnits: "userSpaceOnUse",
          x1: startPx.x,
          y1: startPx.y - ringR,
          x2: startPx.x,
          y2: startPx.y + ringR,
        },
        h("stop", { offset: "0%", stopColor: pal.ink, stopOpacity: 0 }),
        h("stop", { offset: "40%", stopColor: pal.ink, stopOpacity: 0 }),
        h("stop", { offset: "100%", stopColor: pal.ink, stopOpacity: 1 }),
      ),
    ),
    h("circle", {
      key: "ring",
      cx: startPx.x,
      cy: startPx.y,
      r: ringR,
      fill: "none",
      stroke: "url(#startRing)",
      strokeWidth: 1.5 * SCALE,
      strokeDasharray: `${5 * SCALE} ${4 * SCALE}`,
      opacity: 0.6,
    }),
  );

  // ---- Swim finish marker (FA location-crosshairs glyph) ----
  const finishPx = project(FINISH_LON, FINISH_LAT);
  const iconScale = (18 * SCALE) / FINISH_ICON_H;
  svgChildren.push(
    h(
      "g",
      {
        key: "finish",
        transform:
          `translate(${finishPx.x} ${finishPx.y}) scale(${iconScale}) ` +
          `translate(${-FINISH_ICON_W / 2} ${-FINISH_ICON_H / 2})`,
        fill: pal.ink,
        opacity: 0.75,
      },
      h("path", { d: FINISH_ICON_PATH as string }),
    ),
  );

  // ---- Labels (HTML so satori renders text with its bundled Geist) ----
  const labelStyle = (left: number, top: number) =>
    ({
      position: "absolute" as const,
      left,
      top,
      transform: "translate(-50%, -50%)",
      color: pal.label,
      fontSize: 13 * SCALE,
      fontWeight: 600,
      textShadow: `0 0 ${3 * SCALE}px ${pal.halo}, 0 0 ${3 * SCALE}px ${pal.halo}`,
      whiteSpace: "nowrap" as const,
    });

  // ---- Legend (mirrors MapLegend.tsx + .legend CSS) ----
  const labels = tempDomainLabels(args.units);
  const gradient = `linear-gradient(to right, ${tempColorStops(9).join(", ")})`;
  const legend = h(
    "div",
    {
      style: {
        position: "absolute",
        top: 12 * SCALE,
        left: 12 * SCALE,
        display: "flex",
        flexDirection: "column",
        gap: 4 * SCALE,
        padding: `${8 * SCALE}px ${10 * SCALE}px`,
        background: pal.surface,
        border: `1px solid ${pal.border}`,
        borderRadius: 6 * SCALE,
      },
    },
    h(
      "span",
      {
        style: {
          color: pal.label,
          fontSize: 11 * SCALE,
          fontWeight: 700,
          letterSpacing: 0.6 * SCALE,
        },
      },
      "WATER TEMPERATURE",
    ),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 6 * SCALE } },
      h("span", { style: { color: pal.label, fontSize: 12 * SCALE } }, labels.min),
      h("span", {
        style: {
          width: 130 * SCALE,
          height: 10 * SCALE,
          borderRadius: 999,
          border: `1px solid ${pal.border}`,
          backgroundImage: gradient,
        },
      }),
      h("span", { style: { color: pal.label, fontSize: 12 * SCALE } }, labels.max),
    ),
  );

  const tree = h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: OUT_W,
        height: OUT_H,
        backgroundColor: args.theme === "dark" ? "#0c1116" : "#e9eef2",
      },
    },
    h("img", { src: mapboxUrl, width: OUT_W, height: OUT_H, style: { position: "absolute", top: 0, left: 0 } }),
    h(
      "svg",
      {
        width: OUT_W,
        height: OUT_H,
        viewBox: `0 0 ${OUT_W} ${OUT_H}`,
        xmlns: "http://www.w3.org/2000/svg",
        style: { position: "absolute", top: 0, left: 0 },
      },
      svgChildren,
    ),
    h("div", { style: labelStyle(startPx.x, startPx.y + ringR / 2) }, "Swim start"),
    h("div", { style: labelStyle(finishPx.x, finishPx.y - 17 * SCALE) }, "Swim finish"),
    legend,
  );

  const png = Buffer.from(await new ImageResponse(tree, { width: OUT_W, height: OUT_H }).arrayBuffer());
  const outPath = args.out
    ? resolve(args.out)
    : resolve(OUTPUT_DIR, `map-${formatInTimeZone(target, DISPLAY_TZ, "yyyyMMdd-HHmm")}-PT.png`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, png);
  console.log(`Wrote ${outPath} (${OUT_W}x${OUT_H})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
