/** Compass-angle helpers (degrees, 0 = North, clockwise). */

/** Smallest absolute difference between two bearings, in degrees (0..180). */
export function angularDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/** Nearest 16-point compass label for a bearing. */
export function compass16(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[i];
}
