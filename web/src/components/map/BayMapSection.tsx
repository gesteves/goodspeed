"use client";

import dynamic from "next/dynamic";
import type { FieldFeed } from "@/lib/schema";
import styles from "./bayMap.module.css";
import { computeGridExtent } from "./extent";

const BayMap = dynamic(
  () => import("./BayMap").then((m) => m.BayMap),
  { ssr: false, loading: () => <div className={styles.skeleton} /> },
);

interface BayMapSectionProps {
  field: FieldFeed | null;
  nowFieldIndex: number;
  pointTimes: string[];
}

/**
 * Lazy-loaded wrapper for the bay map. Renders nothing when the field feed is
 * missing or when the Mapbox token isn't configured -- the rest of the
 * dashboard works fine without it.
 *
 * The section's aspect ratio is derived from the field grid's actual extent
 * so the map fills the container without blank margins.
 */
export function BayMapSection({
  field,
  nowFieldIndex,
  pointTimes,
}: BayMapSectionProps) {
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
