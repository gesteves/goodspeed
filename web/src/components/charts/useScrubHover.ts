import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { TimeScale } from "./scales";
import { useScrub } from "./ScrubContext";

interface UseScrubHoverArgs {
  /** SVG used to translate clientX into a scale coordinate via its bounding rect. */
  svgRef: RefObject<SVGSVGElement | null>;
  /** HTML hit-area element that owns the pointer + touch listeners. */
  hitRef: RefObject<HTMLDivElement | null>;
  xScale: TimeScale;
  /** Times for each timeseries index, parallel to the data. */
  times: readonly Date[];
  dataLength: number;
}

interface UseScrubHoverResult {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

/**
 * Wires pointer + touch input on a chart-axis-shaped hit area into
 * `ScrubContext`. Snaps `clientX` to the nearest 6-min sample and clamps
 * to the timeseries bounds. Touch is bound via native (non-React) listeners
 * because React 19's synthetic touch routing has been observed to drop
 * horizontal-only gestures under `touch-action: pan-y` on iOS Safari.
 */
export function useScrubHover({
  svgRef,
  hitRef,
  xScale,
  times,
  dataLength,
}: UseScrubHoverArgs): UseScrubHoverResult {
  const { setHoveredIndex } = useScrub();

  const updateFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || times.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const t = xScale.invert(px).getTime();
    const t0 = times[0].getTime();
    const step = times.length > 1 ? times[1].getTime() - t0 : 360_000;
    const idx = Math.round((t - t0) / step);
    setHoveredIndex(Math.max(0, Math.min(dataLength - 1, idx)));
  };

  // Held in a ref so the mounted touch listeners can read the latest closure
  // without being re-attached every render.
  const updateRef = useRef(updateFromClientX);
  useEffect(() => {
    updateRef.current = updateFromClientX;
  });

  useEffect(() => {
    const el = hitRef.current;
    if (!el) return;

    const onTouch = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (touch) updateRef.current(touch.clientX);
    };
    const onTouchEnd = () => setHoveredIndex(null);

    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [hitRef, setHoveredIndex]);

  return {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromClientX(event.clientX);
    },
    onPointerMove: (event) => {
      updateFromClientX(event.clientX);
    },
    onPointerLeave: () => setHoveredIndex(null),
    onPointerCancel: () => setHoveredIndex(null),
  };
}
