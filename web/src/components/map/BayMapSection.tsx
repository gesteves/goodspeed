"use client";

import dynamic from "next/dynamic";
import type { FieldStatus } from "@/lib/data-source";
import type { FieldFeed } from "@/lib/schema";
import styles from "./bayMap.module.css";
import { computeGridExtent } from "./extent";

const BayMap = dynamic(
  () => import("./BayMap").then((m) => m.BayMap),
  { ssr: false, loading: () => <div className={styles.skeleton} /> },
);

interface BayMapSectionProps {
  field: FieldFeed | null;
  fieldStatus: FieldStatus;
  nowFieldIndex: number;
  pointTimes: string[];
}

/**
 * Lazy-loaded wrapper for the bay map.
 *
 * Render decisions:
 *  - `fieldStatus === "failed"` → render an inline notice so users understand
 *    the map is temporarily down rather than wondering where a section went.
 *  - `fieldStatus === "unconfigured"` or no Mapbox token → render nothing.
 *    These are deploy-time choices, not a degraded production state.
 *  - happy path → render the lazy `BayMap` with an aspect-ratio derived from
 *    the field grid's actual extent.
 */
export function BayMapSection({
  field,
  fieldStatus,
  nowFieldIndex,
  pointTimes,
}: BayMapSectionProps) {
  if (fieldStatus === "failed") {
    return (
      <section className={styles.unavailable} role="status" aria-live="polite">
        Bay map data temporarily unavailable — charts below remain live.
      </section>
    );
  }
  if (!field) return null;
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    if (typeof window !== "undefined") {
      console.warn(
        "NEXT_PUBLIC_MAPBOX_TOKEN is not set; the bay map is hidden.",
      );
    }
    return null;
  }
  const { aspectRatio } = computeGridExtent(field.grid.lat, field.grid.lon);
  return (
    <section
      className={styles.section}
      style={{ aspectRatio }}
      aria-label="Bay current and temperature map"
    >
      <BayMap
        field={field}
        nowFieldIndex={nowFieldIndex}
        pointTimes={pointTimes}
      />
    </section>
  );
}
