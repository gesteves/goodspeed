import { faLocationCrosshairs } from "@fortawesome/pro-regular-svg-icons";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useState } from "react";
import { PUBLIC_MAPBOX_TOKEN } from "astro:env/client";
import { tempColor } from "@/lib/colors";
import {
  ARROW_HEAD_BACK,
  ARROW_HEAD_FRONT,
  ARROW_HEAD_HALF,
  ARROW_SHAFT_PAD,
  ARROW_SHAFT_WIDTH,
  FINISH_LAT,
  FINISH_LON,
  SLACK_SPEED_KT,
  START_LAT,
  START_LON,
} from "@/lib/map-constants";

const [FINISH_ICON_W, FINISH_ICON_H, , , FINISH_ICON_PATH] =
  faLocationCrosshairs.icon;
import type { FieldFeed } from "@/lib/schema";
import { useScrub } from "../charts/ScrubContext";
import { useTheme } from "../providers/ThemeProvider";
import { useUnits } from "../providers/UnitsProvider";
import styles from "./bayMap.module.css";
import { computeGridExtent } from "./extent";
import { MapLegend, arrowPx } from "./MapLegend";
import { useMapPositions } from "./projection";

export interface BayMapProps {
  field: FieldFeed;
  /** Field-frame index closest to the current real-time "now". */
  nowFieldIndex: number;
  /** Point feed timestamps, parallel-indexed with the chart `hoveredIndex`. */
  pointTimes: string[];
}

const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

function offsetLonByMeters(lat: number, lon: number, meters: number): number {
  return lon + meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sized so the edge of the ring sits 1.5 miles from the finish: a swimmer
// dropped anywhere on the visible arc has at most 1.5 mi of water to cover.
const START_RADIUS_M =
  haversineMeters(START_LAT, START_LON, FINISH_LAT, FINISH_LON) -
  1.5 * 1609.344;

/** Use the chart scrub to pick a frame in the field feed (snap by timestamp). */
function useFieldFrameIndex(
  hovered: number | null,
  pointTimes: readonly string[],
  fieldTimes: readonly string[],
  fallback: number,
): number {
  const mapping = useMemo(() => {
    const fts = fieldTimes.map((t) => new Date(t).getTime());
    return pointTimes.map((p) => {
      const target = new Date(p).getTime();
      let best = 0;
      let bestDiff = Infinity;
      for (let j = 0; j < fts.length; j++) {
        const d = Math.abs(fts[j] - target);
        if (d < bestDiff) {
          bestDiff = d;
          best = j;
        }
      }
      return best;
    });
  }, [pointTimes, fieldTimes]);
  if (hovered == null) return fallback;
  return mapping[hovered] ?? fallback;
}

function pickStyle(theme: "system" | "light" | "dark"): string {
  if (theme === "dark") return DARK_STYLE;
  if (theme === "light") return LIGHT_STYLE;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK_STYLE
    : LIGHT_STYLE;
}

export function BayMap({ field, nowFieldIndex, pointTimes }: BayMapProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const { theme } = useTheme();
  const { units } = useUnits();
  const { hoveredIndex } = useScrub();

  const fieldIndex = useFieldFrameIndex(
    hoveredIndex,
    pointTimes,
    field.t,
    nowFieldIndex,
  );

  const gridExtent = useMemo(
    () => computeGridExtent(field.center),
    [field.center],
  );

  // Initialize the Mapbox map once a container is mounted. Theme changes are
  // handled below; we only construct one Map instance per mount.
  useEffect(() => {
    if (!container || !PUBLIC_MAPBOX_TOKEN) return;

    mapboxgl.accessToken = PUBLIC_MAPBOX_TOKEN;
    const instance = new mapboxgl.Map({
      container,
      style: pickStyle(theme),
      // Mapbox 3.x defaults to "globe" which fails silently on some
      // GPUs/drivers; force flat mercator since we're zoomed into a bay.
      projection: { name: "mercator" },
      // Fit to the *grid's* extent (not the whole bbox) so the map zooms in
      // close enough that the arrows fill the canvas without blank margins.
      bounds: [
        [gridExtent.lonMin, gridExtent.latMin],
        [gridExtent.lonMax, gridExtent.latMax],
      ],
      fitBoundsOptions: { padding: 10, animate: false },
      maxPitch: 0,
      maxZoom: 16,
      attributionControl: true,
    });
    // Fully static map -- the dashboard controls the view, so disable every
    // user interaction.
    instance.dragPan.disable();
    instance.dragRotate.disable();
    instance.scrollZoom.disable();
    instance.boxZoom.disable();
    instance.doubleClickZoom.disable();
    instance.touchZoomRotate.disable();
    instance.keyboard.disable();

    // Mapbox measures the container once at construction; if the layout
    // hasn't settled yet the canvas ends up sized 0x0 and tiles never paint.
    // A ResizeObserver keeps it in sync with the actual container size.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container);

    // Defer publishing the instance to React state until Mapbox finishes its
    // initial load, so the overlay only paints once `map.project()` is
    // ready. Subscribing to an external event satisfies the
    // `react-hooks/set-state-in-effect` rule.
    const onLoad = () => {
      instance.resize();
      setMap(instance);
    };
    instance.on("load", onLoad);

    return () => {
      observer.disconnect();
      instance.off("load", onLoad);
      instance.remove();
      setMap(null);
    };
    // Theme/bbox/field changes are handled by other effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  // Theme changes -> swap style. setStyle just kicks off a style fetch;
  // `map.project()` still works during the swap, so no need to gate positions.
  useEffect(() => {
    if (!map) return;
    map.setStyle(pickStyle(theme));
  }, [theme, map]);

  // Track container width so arrows can scale down on narrow screens. Without
  // scaling, the SVG arrows keep their fixed pixel size while the grid spacing
  // shrinks, so neighbouring arrows visually collide on phones. ResizeObserver
  // fires once on observe, so we don't need to seed the width synchronously --
  // doing so would trip the `react-hooks/set-state-in-effect` lint rule.
  useEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(container.clientWidth);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const arrowScale = useMemo(() => {
    // 0 = not measured yet (ResizeObserver hasn't fired). Avoid flashing tiny
    // arrows by treating that as full scale until we have a real width.
    if (containerWidth === 0) return 1;
    if (containerWidth >= 640) return 1;
    if (containerWidth <= 320) return 0.55;
    return 0.55 + ((containerWidth - 320) / 320) * 0.45;
  }, [containerWidth]);

  const positions = useMapPositions(map, field.grid.lat, field.grid.lon);

  // Project the start centre + an edge point + the finish in one call so we
  // get a geographically-stable radius for the start disk (the map auto-fits
  // to its bounds, so px-per-metre changes with container width).
  const markerLats = useMemo(
    () => [START_LAT, START_LAT, FINISH_LAT],
    [],
  );
  const markerLons = useMemo(
    () => [
      START_LON,
      offsetLonByMeters(START_LAT, START_LON, START_RADIUS_M),
      FINISH_LON,
    ],
    [],
  );
  const markerPositions = useMapPositions(map, markerLats, markerLons);
  const startPx = markerPositions[0];
  const startEdgePx = markerPositions[1];
  const finishPx = markerPositions[2];
  const startRadiusPx =
    startPx && startEdgePx
      ? Math.hypot(startEdgePx.x - startPx.x, startEdgePx.y - startPx.y)
      : 0;

  const frame =
    field.frames[
      Math.min(Math.max(0, fieldIndex), field.frames.length - 1)
    ];

  const summary = useMemo(() => {
    if (!frame) return null;
    const temps =
      units === "imperial" ? frame.water_temp_f : frame.water_temp_c;
    const speeds =
      units === "imperial" ? frame.current_speed_kt : frame.current_speed_ms;
    const tempUnit = units === "imperial" ? "°F" : "°C";
    const speedUnit = units === "imperial" ? "kt" : "m/s";
    // Schema enforces .min(1) on each array but not parity across them; skip
    // any trailing positions where either array runs short.
    const n = Math.min(temps.length, speeds.length);
    if (n === 0) return null;
    let minT = Infinity;
    let maxT = -Infinity;
    let minS = Infinity;
    let maxS = -Infinity;
    for (let i = 0; i < n; i++) {
      if (temps[i] < minT) minT = temps[i];
      if (temps[i] > maxT) maxT = temps[i];
      if (speeds[i] < minS) minS = speeds[i];
      if (speeds[i] > maxS) maxS = speeds[i];
    }
    return (
      `Modeled bay map across ${n} water points in the ` +
      `central San Francisco Bay near Alcatraz. Water temperature ranges from ` +
      `${minT.toFixed(1)} to ${maxT.toFixed(1)} ${tempUnit}; current speed ` +
      `${minS.toFixed(1)} to ${maxS.toFixed(1)} ${speedUnit}. Race start is a ` +
      `boat drop near Alcatraz at a location chosen on race day; the finish ` +
      `is at the St. Francis Yacht Club.`
    );
  }, [frame, units]);

  return (
    <div className={styles.wrap}>
      {summary && <p className="visually-hidden">{summary}</p>}
      <div className={styles.map} ref={setContainer} />
      {positions.length > 0 && frame && (
        <svg className={styles.overlay} aria-hidden="true">
          {positions.map((p, i) => {
            // Skip any grid index whose frame data is missing: schema enforces
            // .min(1) on each frame array but not parity with positions.
            const bearing = frame.current_bearing_deg[i];
            const speedKt = frame.current_speed_kt[i];
            const tempC = frame.water_temp_c[i];
            if (bearing == null || speedKt == null || tempC == null) {
              return null;
            }
            return (
              <Arrow
                key={i}
                x={p.x}
                y={p.y}
                bearing={bearing}
                speedKt={speedKt}
                tempC={tempC}
                scale={arrowScale}
              />
            );
          })}
          {startPx &&
            startRadiusPx > 0 &&
            (() => {
              const r = Math.max(startRadiusPx, 36 * arrowScale);
              const labelX = startPx.x;
              const labelY = startPx.y + r / 2;
              return (
                <>
                  <defs>
                    <linearGradient
                      id="bayMap-startRing"
                      gradientUnits="userSpaceOnUse"
                      x1={startPx.x}
                      y1={startPx.y - r}
                      x2={startPx.x}
                      y2={startPx.y + r}
                    >
                      <stop offset="0%" stopColor="var(--text)" stopOpacity="0" />
                      <stop offset="40%" stopColor="var(--text)" stopOpacity="0" />
                      <stop offset="100%" stopColor="var(--text)" stopOpacity="1" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx={startPx.x}
                    cy={startPx.y}
                    r={r}
                    fill="none"
                    stroke="url(#bayMap-startRing)"
                    strokeWidth={1.5 * arrowScale}
                    strokeDasharray={`${5 * arrowScale} ${4 * arrowScale}`}
                    className={styles.startZone}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.markerLabel}
                  >
                    Swim start
                  </text>
                </>
              );
            })()}
          {finishPx && (
            <>
              <FinishMarker x={finishPx.x} y={finishPx.y} scale={arrowScale} />
              <text
                x={finishPx.x}
                y={finishPx.y - 17 * arrowScale}
                textAnchor="middle"
                className={styles.markerLabel}
              >
                Swim finish
              </text>
            </>
          )}
        </svg>
      )}
      <MapLegend units={units} />
    </div>
  );
}

function FinishMarker({
  x,
  y,
  scale,
}: {
  x: number;
  y: number;
  scale: number;
}) {
  const s = (18 * scale) / FINISH_ICON_H;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s}) translate(${-FINISH_ICON_W / 2} ${-FINISH_ICON_H / 2})`}
      className={styles.finishMarker}
    >
      <path d={FINISH_ICON_PATH as string} />
    </g>
  );
}

function Arrow({
  x,
  y,
  bearing,
  speedKt,
  tempC,
  scale,
}: {
  x: number;
  y: number;
  bearing: number;
  speedKt: number;
  tempC: number;
  scale: number;
}) {
  const color = tempColor(tempC);
  if (speedKt < SLACK_SPEED_KT) {
    return (
      <circle
        cx={x}
        cy={y}
        r={3 * scale}
        fill="none"
        stroke={color}
        strokeWidth={2 * scale}
      />
    );
  }
  const len = arrowPx(speedKt) * scale;
  const headHalf = ARROW_HEAD_HALF * scale;
  const headBack = ARROW_HEAD_BACK * scale;
  const headFront = ARROW_HEAD_FRONT * scale;
  const shaftPad = ARROW_SHAFT_PAD * scale;
  const tip = -len / 2;
  return (
    <g transform={`rotate(${bearing} ${x} ${y})`}>
      <line
        x1={x}
        y1={y + len / 2}
        x2={x}
        y2={y + tip + shaftPad}
        stroke={color}
        strokeWidth={ARROW_SHAFT_WIDTH * scale}
        strokeLinecap="round"
      />
      <polygon
        points={`${x},${y + tip - headFront} ${x - headHalf},${y + tip + headBack} ${x + headHalf},${y + tip + headBack}`}
        fill={color}
      />
    </g>
  );
}
