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

// Finish-marker icon. Path data is copied verbatim from
// `@fortawesome/pro-regular-svg-icons` so the OG edge function (which runs in
// Deno and can't resolve npm packages) doesn't need to import the icon set.
// Re-export here keeps the constants file the single source of shared
// geometry between BayMap and og.tsx. Currently: `faLocationCrosshairs`.
export const FINISH_ICON = {
  width: 576,
  height: 512,
  pathData:
    "M288-16c13.3 0 24 10.7 24 24l0 25.3C416.5 44.4 499.6 127.5 510.7 232l25.3 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-25.3 0C499.6 384.5 416.5 467.6 312 478.7l0 25.3c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-25.3C159.5 467.6 76.4 384.5 65.3 280L40 280c-13.3 0-24-10.7-24-24s10.7-24 24-24l25.3 0C76.4 127.5 159.5 44.4 264 33.3L264 8c0-13.3 10.7-24 24-24zM464 256a176 176 0 1 0 -352 0 176 176 0 1 0 352 0zm-112 0a64 64 0 1 0 -128 0 64 64 0 1 0 128 0zm-176 0a112 112 0 1 1 224 0 112 112 0 1 1 -224 0z",
} as const;
