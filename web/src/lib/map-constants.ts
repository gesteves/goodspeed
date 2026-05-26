/**
 * Geometric constants shared between the live bay map
 * (`src/components/map/BayMap.tsx`) and the OG share image
 * (`netlify/edge-functions/og.tsx`).
 *
 * The two render the same view through different runtimes (Astro/Node and
 * Netlify Edge/Deno) and bundlers, so they cannot share React or Mapbox code.
 * Constants, however, are just numbers — keeping them here means a future
 * marker move or arrow-shape tweak only edits one place. This file must
 * remain pure (no imports, no helpers) so the Deno edge bundler can pull
 * it in via a relative import.
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
