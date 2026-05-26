import type { KeyboardEvent } from "react";
import { useScrub } from "./ScrubContext";

// SFBOFS publishes points every 6 minutes, so one step is one sample;
// Shift+Arrow jumps ten samples (~1 h). Home/End jump to the series ends;
// Escape releases the scrub back to "Now".
const SCRUB_STEP_NORMAL = 1;
const SCRUB_STEP_SHIFT = 10;

/**
 * Returns an `onKeyDown` handler that drives the shared scrub index from the
 * keyboard. Both the chart stack and the map's time-axis strip wire it to
 * a focusable container so the two surfaces can't diverge.
 */
export function useScrubKeyboard(
  nowIndex: number,
  lastIndex: number,
): (event: KeyboardEvent<HTMLElement>) => void {
  const { hoveredIndex, setHoveredIndex } = useScrub();
  return (event) => {
    const current = hoveredIndex ?? nowIndex;
    const step = event.shiftKey ? SCRUB_STEP_SHIFT : SCRUB_STEP_NORMAL;
    if (event.key === "ArrowLeft") {
      setHoveredIndex(Math.max(0, current - step));
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      setHoveredIndex(Math.min(lastIndex, current + step));
      event.preventDefault();
    } else if (event.key === "Home") {
      setHoveredIndex(0);
      event.preventDefault();
    } else if (event.key === "End") {
      setHoveredIndex(lastIndex);
      event.preventDefault();
    } else if (event.key === "Escape") {
      setHoveredIndex(null);
      event.preventDefault();
    }
  };
}
