import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";

export interface PixelPosition {
  x: number;
  y: number;
}

/**
 * Project a set of (lat, lon) coordinates to pixel positions on a Mapbox map,
 * keeping them up to date as the map pans/zooms/resizes.
 *
 * Pure-ish: takes the map instance (null until the map is ready) plus parallel
 * lat/lon arrays, returns the corresponding pixel coordinates.
 */
export function useMapPositions(
  map: mapboxgl.Map | null,
  lats: readonly number[] | Float64Array,
  lons: readonly number[] | Float64Array,
): PixelPosition[] {
  const [positions, setPositions] = useState<PixelPosition[]>([]);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      const n = Math.min(lats.length, lons.length);
      const out = new Array<PixelPosition>(n);
      for (let i = 0; i < n; i++) {
        const p = map.project([Number(lons[i]), Number(lats[i])]);
        out[i] = { x: p.x, y: p.y };
      }
      setPositions(out);
    };
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
    };
  }, [map, lats, lons]);

  return positions;
}
