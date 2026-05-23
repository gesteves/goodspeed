import type { UnitSystem } from "./units/units";

/**
 * Temperature -> CSS color ramp for the bay map.
 *
 * Fixed °C domain matches the worker's water-temperature sanity bounds and
 * gives stable color semantics across cycles (56 °F looks the same color
 * tomorrow as it does today). Stops are in OKLCH for a perceptually-smooth
 * gradient that reads as cool-blue -> teal -> warm-orange.
 */

export const TEMP_DOMAIN_C: readonly [number, number] = [10, 17];

interface Stop {
  c: number; // °C anchor
  L: number; // OKLCH lightness 0..1
  C: number; // chroma
  h: number; // hue degrees
}

const STOPS: readonly Stop[] = [
  { c: 10, L: 0.7, C: 0.14, h: 250 }, // cool blue
  { c: 12, L: 0.78, C: 0.12, h: 210 }, // cool cyan
  { c: 14, L: 0.86, C: 0.1, h: 150 }, // mid green
  { c: 16, L: 0.82, C: 0.14, h: 60 }, // warm yellow
  { c: 17, L: 0.7, C: 0.18, h: 40 }, // warm orange-red
];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate hue along the shortest arc. */
function hueLerp(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

const fmt = (n: number, digits = 3) => n.toFixed(digits);

function stopToCss(s: { L: number; C: number; h: number }): string {
  return `oklch(${fmt(s.L)} ${fmt(s.C)} ${fmt(s.h, 2)})`;
}

/** Map a water temperature (°C) to a CSS color string. Clamped to the domain. */
export function tempColor(tempC: number): string {
  const c = clamp(tempC, STOPS[0].c, STOPS[STOPS.length - 1].c);
  let i = 0;
  while (i < STOPS.length - 1 && c > STOPS[i + 1].c) i++;
  if (i >= STOPS.length - 1) return stopToCss(STOPS[STOPS.length - 1]);
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = (c - a.c) / (b.c - a.c);
  return stopToCss({
    L: lerp(a.L, b.L, t),
    C: lerp(a.C, b.C, t),
    h: hueLerp(a.h, b.h, t),
  });
}

/** Labels for the legend in the active unit system. */
export function tempDomainLabels(units: UnitSystem): { min: string; max: string } {
  const [c0, c1] = TEMP_DOMAIN_C;
  if (units === "imperial") {
    return {
      min: `${Math.round(c0 * 1.8 + 32)}°F`,
      max: `${Math.round(c1 * 1.8 + 32)}°F`,
    };
  }
  return { min: `${c0}°C`, max: `${c1}°C` };
}

/** A small set of evenly-spaced colors across the domain, for legend gradients. */
export function tempColorStops(n = 9): string[] {
  const [lo, hi] = TEMP_DOMAIN_C;
  return Array.from({ length: n }, (_, i) => tempColor(lo + ((hi - lo) * i) / (n - 1)));
}
