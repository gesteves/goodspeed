import { useParentSize } from "@visx/responsive";
import type { ReactNode } from "react";

/**
 * Width-only replacement for visx's `<ParentSize>`.
 *
 * visx v4's `<ParentSize>` renders its children inside an absolutely
 * positioned, `overflow: hidden` overlay (`position: absolute; inset: 0`) sized
 * to the parent's height. Our chart wrappers (`.stack`, `.strip`) are
 * content-height — they have no explicit height — so that overlay collapses to
 * zero height and clips the entire chart stack, leaving an empty box.
 *
 * `useParentSize` instead observes a normal, content-height `<div>` and reports
 * its measured width, letting the children define their own height (the v3
 * `<ParentSize>` behaviour the charts were written against). We only ever need
 * the width here — every consumer gates on `width > 1` and computes its own
 * fixed heights.
 */
export function MeasuredWidth({
  children,
}: {
  children: (size: { width: number }) => ReactNode;
}) {
  const { parentRef, width } = useParentSize({ debounceTime: 0 });
  return (
    <div ref={parentRef} style={{ position: "relative", width: "100%" }}>
      {children({ width })}
    </div>
  );
}
