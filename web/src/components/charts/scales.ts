import { scaleTime } from "@visx/scale";

/** Shared margins so every stacked chart aligns pixel-for-pixel on the x axis. */
export const CHART_MARGIN = {
  top: 10,
  right: 14,
  bottom: 24,
  left: 46,
} as const;

/** The single time scale shared across every chart in the forecast stack. */
export function makeTimeScale(domain: [Date, Date], range: [number, number]) {
  return scaleTime<number>({ domain, range });
}

export type TimeScale = ReturnType<typeof makeTimeScale>;
