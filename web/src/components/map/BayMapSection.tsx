import { lazy, Suspense } from "react";
import { PUBLIC_MAPBOX_TOKEN } from "astro:env/client";
import type { FieldStatus } from "@/lib/data-source";
import type { FieldFeed } from "@/lib/schema";
import styles from "./bayMap.module.css";
import { VIEW_HEIGHT_MILES, VIEW_WIDTH_MILES, computeGridExtent } from "./extent";
import { MapTimeAxis } from "./MapTimeAxis";

// Lazy import: keeps Mapbox GL (~hundreds of KB) out of the initial bundle,
// and -- importantly -- never imports the module on the server (Mapbox GL
// touches `window` at import time).
const BayMap = lazy(() =>
  import("./BayMap").then((m) => ({ default: m.BayMap })),
);

interface BayMapSectionProps {
  field: FieldFeed | null;
  fieldStatus: FieldStatus;
  nowFieldIndex: number;
  pointTimes: string[];
  nowIndex: number;
}

/**
 * Lazy-loaded wrapper for the bay map.
 *
 * Render decisions:
 *  - `fieldStatus === "failed"` → render an inline notice so users understand
 *    the map is temporarily down rather than wondering where a section went.
 *  - `fieldStatus === "unconfigured"` or no Mapbox token → render nothing.
 *    These are deploy-time choices, not a degraded production state.
 *  - `fieldStatus === "loading"` → reserve the section's footprint with a
 *    skeleton so the field can fill in after hydration without layout shift.
 *  - happy path → render the lazy `BayMap` with an aspect-ratio derived from
 *    the field grid's actual extent.
 *
 * The time-axis strip (`MapTimeAxis`) is rendered as a sibling of the map
 * inside the section so it appears synchronously, even while Mapbox is
 * lazy-loading. It needs only timeseries data (already available on the
 * server), so it works in the loading branch too.
 */
// The view aspect ratio is a constant of the camera, not of the data, so the
// loading skeleton matches the eventual map exactly and avoids any CLS.
const DEFAULT_ASPECT_RATIO = VIEW_WIDTH_MILES / VIEW_HEIGHT_MILES;

export function BayMapSection({
  field,
  fieldStatus,
  nowFieldIndex,
  pointTimes,
  nowIndex,
}: BayMapSectionProps) {
  if (fieldStatus === "failed") {
    return (
      <section className={styles.unavailable} role="status" aria-live="polite">
        Bay map data temporarily unavailable — charts below remain live.
      </section>
    );
  }
  if (!PUBLIC_MAPBOX_TOKEN) {
    if (typeof window !== "undefined") {
      console.warn("PUBLIC_MAPBOX_TOKEN is not set; the bay map is hidden.");
    }
    return null;
  }
  if (fieldStatus === "loading") {
    return (
      <section
        className={styles.section}
        aria-label="Bay current and temperature map"
        aria-busy="true"
      >
        <div
          className={styles.mapBox}
          style={{ aspectRatio: DEFAULT_ASPECT_RATIO }}
        >
          <div className={styles.skeleton} />
        </div>
        <MapTimeAxis pointTimes={pointTimes} nowIndex={nowIndex} />
      </section>
    );
  }
  if (!field) return null;
  const { aspectRatio } = computeGridExtent(field.center);
  return (
    <section
      className={styles.section}
      aria-label="Bay current and temperature map"
    >
      <div className={styles.mapBox} style={{ aspectRatio }}>
        <Suspense fallback={<div className={styles.skeleton} />}>
          <BayMap
            field={field}
            nowFieldIndex={nowFieldIndex}
            pointTimes={pointTimes}
          />
        </Suspense>
      </div>
      <MapTimeAxis pointTimes={pointTimes} nowIndex={nowIndex} />
    </section>
  );
}
