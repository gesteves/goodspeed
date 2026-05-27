/**
 * Geometric constants (and one tiny pure helper) shared between the live bay
 * map (`src/components/map/BayMap.tsx`) and the OG share image
 * (`netlify/functions/og.mts`).
 *
 * Both renderers go through different bundlers and cannot share React or
 * Mapbox code -- but constants and small pure functions are bundler-agnostic.
 * Keeping them here means a future marker move, arrow-shape tweak, or
 * speed->px curve change only edits one place. Keep this file
 * dependency-free so it stays cheap to import from anywhere.
 */

// Race finish: St. Francis Yacht Club.
export const FINISH_LAT = 37.80706968914476;
export const FINISH_LON = -122.4480366321103;

// Race start: boat drop on race day. Centered on Alcatraz; the ring radius
// covers the rough envelope of likely drop points.
export const START_LAT = 37.82666939246081;
export const START_LON = -122.42268871139198;

// Arrow geometry (in unscaled pixels). The renderers multiply by their own
// scale factor — see `arrowScale` in BayMap.tsx and ARROW_SCALE in og.tsx.
export const ARROW_HEAD_HALF = 4.5;
export const ARROW_HEAD_BACK = 5;
export const ARROW_HEAD_FRONT = 3;
export const ARROW_SHAFT_PAD = 4;
export const ARROW_SHAFT_WIDTH = 3;

// Speed threshold (kt) below which we draw the "slack" circle marker instead
// of an arrow.
export const SLACK_SPEED_KT = 0.08;

/** Linear scaling kt -> px in the same range used for the map arrows. */
export function arrowPx(speedKt: number): number {
  const MIN = 14;
  const MAX = 32;
  const MAX_KT = 2.5;
  return MIN + Math.min(1, Math.max(0, speedKt / MAX_KT)) * (MAX - MIN);
}
