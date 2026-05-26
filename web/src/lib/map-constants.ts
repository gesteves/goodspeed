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
// `@fortawesome/pro-light-svg-icons` so the OG edge function (which runs in
// Deno and can't resolve npm packages) doesn't need to import the icon set.
// Re-export here keeps the constants file the single source of shared
// geometry between BayMap and og.tsx. Currently: `faLocationCrosshairs`.
export const FINISH_ICON = {
  width: 576,
  height: 512,
  pathData:
    "M288-16c8.8 0 16 7.2 16 16l0 32.6C415 40.4 503.6 129 511.4 240l32.6 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-32.6 0C503.6 383 415 471.6 304 479.4l0 32.6c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-32.6C161 471.6 72.4 383 64.6 272L32 272c-8.8 0-16-7.2-16-16s7.2-16 16-16l32.6 0C72.4 129 161 40.4 272 32.6L272 0c0-8.8 7.2-16 16-16zM96 256a192 192 0 1 0 384 0 192 192 0 1 0 -384 0zm112 0a80 80 0 1 0 160 0 80 80 0 1 0 -160 0zm80 112a112 112 0 1 1 0-224 112 112 0 1 1 0 224z",
} as const;
