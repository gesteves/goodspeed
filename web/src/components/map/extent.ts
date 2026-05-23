export interface GridExtent {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  /** Visual aspect ratio (width / height) at this latitude in Web Mercator. */
  aspectRatio: number;
}

/**
 * Fraction of the grid's latitude span trimmed from the TOP (northern) edge
 * of the displayed map view. Pushes Alcatraz closer to the top edge of the
 * frame; arrows above the new latMax fall outside the wrap's `overflow:hidden`
 * and aren't shown.
 */
export const TOP_CROP_FACTOR = 0.2;

/**
 * Compute the lat/lon extent the map should display plus its Mercator aspect
 * ratio. Tight to the grid points, with ``TOP_CROP_FACTOR`` trimmed off the
 * north edge so the corridor's busiest band fills the frame.
 */
export function computeGridExtent(
  lats: readonly number[],
  lons: readonly number[],
  topCropFactor: number = TOP_CROP_FACTOR,
): GridExtent {
  if (lats.length === 0 || lats.length !== lons.length) {
    throw new Error(
      "computeGridExtent: lats and lons must be non-empty and matched",
    );
  }
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (let i = 0; i < lats.length; i++) {
    const la = lats[i];
    const lo = lons[i];
    if (la < latMin) latMin = la;
    if (la > latMax) latMax = la;
    if (lo < lonMin) lonMin = lo;
    if (lo > lonMax) lonMax = lo;
  }
  const gridSpan = latMax - latMin;
  const croppedLatMax = latMax - gridSpan * topCropFactor;
  const midLat = (latMin + croppedLatMax) / 2;
  const w = (lonMax - lonMin) * Math.cos((midLat * Math.PI) / 180);
  const h = croppedLatMax - latMin;
  return {
    latMin,
    latMax: croppedLatMax,
    lonMin,
    lonMax,
    aspectRatio: w / h,
  };
}
