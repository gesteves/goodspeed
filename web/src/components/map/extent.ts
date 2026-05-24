export interface GridExtent {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  /** Visual aspect ratio (width / height) at this latitude in Web Mercator. */
  aspectRatio: number;
}

/**
 * Displayed map view size, in statute miles. Independent of the feed's bbox --
 * the bbox controls how much area of arrows the API extracts (more = buffer
 * for re-centering), while these dimensions control what the camera shows.
 * Tune these to change the map's zoom level / aspect ratio.
 */
export const VIEW_HEIGHT_MILES = 1.77;
export const VIEW_WIDTH_MILES = 3.0;

/** Subset of {@link FieldFeed["center"]} needed to position the view. */
export interface ViewCenter {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_MI = 3958.7613;
const MI_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_MI) / 180;

/**
 * Compute the lat/lon extent the map should display plus its Mercator aspect
 * ratio. View dimensions come from ``VIEW_{HEIGHT,WIDTH}_MILES``; the view is
 * centered on ``center`` (published by the API as the single source of truth
 * for where the map points).
 */
export function computeGridExtent(center: ViewCenter): GridExtent {
  const miPerDegLon = MI_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const latSpan = VIEW_HEIGHT_MILES / MI_PER_DEG_LAT;
  const lonSpan = VIEW_WIDTH_MILES / miPerDegLon;
  return {
    latMin: center.lat - latSpan / 2,
    latMax: center.lat + latSpan / 2,
    lonMin: center.lon - lonSpan / 2,
    lonMax: center.lon + lonSpan / 2,
    aspectRatio: VIEW_WIDTH_MILES / VIEW_HEIGHT_MILES,
  };
}
