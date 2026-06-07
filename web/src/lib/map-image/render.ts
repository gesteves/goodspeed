/**
 * Shared renderer for the high-resolution bay-map still: a Mapbox Static
 * Images basemap with the water-temperature current arrows, the swim-start
 * ring, the swim-finish marker, on-map labels, and the temperature legend.
 *
 * This is the single source of truth for that image. Two callers use it:
 *   - `scripts/map-image.ts` -- the local CLI, run via tsx, writes a PNG file.
 *   - `netlify/functions/map.mts` -- the `/images/*.png` endpoints.
 *
 * It builds only the satori/`@vercel/og` element tree (no I/O, no env, no
 * `ImageResponse`): callers fetch the feed, pick the frame, and wrap the tree.
 * It imports the live map's shared geometry / constants via *relative* paths
 * (not the `@/` alias) so it resolves identically under tsx and the Netlify
 * function bundler.
 */
import { faLocationCrosshairs } from "@fortawesome/pro-regular-svg-icons";
import { createElement as h, type ReactElement, type ReactNode } from "react";
import { TEMP_DOMAIN_C, tempDomainLabels } from "../colors";
import {
  MI_PER_DEG_LAT,
  VIEW_HEIGHT_MILES,
  VIEW_WIDTH_MILES,
} from "../../components/map/extent";
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
  START_RADIUS_M,
} from "../map-constants";
import type { FieldFeed } from "../schema";
import type { UnitSystem } from "../units/units";

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
// applied on top of SCALE.
export const DEFAULT_ARROW_BOOST = 1.25;

export type MapImageTheme = "light" | "dark";

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
const PALETTES: Record<MapImageTheme, Palette> = {
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

// Font Awesome "location-crosshairs" glyph for the finish marker.
const [FINISH_ICON_W, FINISH_ICON_H, , , FINISH_ICON_RAW] = faLocationCrosshairs.icon;
const FINISH_ICON_PATH = Array.isArray(FINISH_ICON_RAW) ? FINISH_ICON_RAW[0] : FINISH_ICON_RAW;

interface Pt {
  x: number;
  y: number;
}

export interface BuildMapImageOptions {
  /** Unrestricted Mapbox token for the Static Images API. */
  token: string;
  theme?: MapImageTheme;
  units?: UnitSystem;
  /** Arrow size multiplier on top of SCALE. Defaults to DEFAULT_ARROW_BOOST. */
  arrowBoost?: number;
}

export interface BuiltMapImage {
  /** The `@vercel/og` element tree; pass to `new ImageResponse(tree, …)`. */
  tree: ReactElement;
  width: number;
  height: number;
}

/**
 * Build the `@vercel/og` element tree for `feed`'s frame at `frameIdx`
 * (clamped to the frame count). Returns the tree plus the output dimensions;
 * the caller wraps it in an `ImageResponse`.
 */
export function buildMapImage(
  feed: FieldFeed,
  frameIdx: number,
  opts: BuildMapImageOptions,
): BuiltMapImage {
  const theme = opts.theme ?? "light";
  const units = opts.units ?? "imperial";
  const arrowBoost = opts.arrowBoost ?? DEFAULT_ARROW_BOOST;
  const pal = PALETTES[theme];

  const { center, grid } = feed;
  const frame = feed.frames[Math.min(frameIdx, feed.frames.length - 1)];

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

  const mapboxUrl =
    `https://api.mapbox.com/styles/v1/mapbox/${pal.style}/static/` +
    `${center.lon},${center.lat},${zoom.toFixed(4)}/` +
    `${LOGICAL_W}x${LOGICAL_H}@2x?access_token=${opts.token}`;

  // ---- Current arrows (ported from og.mts, scaled by SCALE) ----
  const n = Math.min(
    grid.lat.length,
    grid.lon.length,
    frame.current_speed_kt.length,
    frame.current_bearing_deg.length,
    frame.water_temp_c.length,
  );
  const aScale = SCALE * arrowBoost;
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

  // ---- Swim start ring (dashed circle midway between Alcatraz and shore) ----
  const startPx = project(START_LON, START_LAT);
  const startEast = project(offsetLonByMeters(START_LAT, START_LON, START_RADIUS_M), START_LAT);
  const ringR = Math.max(Math.abs(startEast.x - startPx.x), 36 * SCALE);
  svgChildren.push(
    h("circle", {
      key: "ring",
      cx: startPx.x,
      cy: startPx.y,
      r: ringR,
      fill: "none",
      stroke: pal.ink,
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
  const labels = tempDomainLabels(units);
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
        backgroundColor: theme === "dark" ? "#0c1116" : "#e9eef2",
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
    h("div", { style: labelStyle(startPx.x, startPx.y) }, "Swim start"),
    h("div", { style: labelStyle(finishPx.x, finishPx.y - 17 * SCALE) }, "Swim finish"),
    legend,
  );

  return { tree, width: OUT_W, height: OUT_H };
}
