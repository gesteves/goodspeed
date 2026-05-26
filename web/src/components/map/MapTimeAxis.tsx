import { AxisBottom } from "@visx/axis";
import { ParentSize } from "@visx/responsive";
import { Line } from "@visx/shape";
import { useMemo, useRef } from "react";
import { formatAxisTick, formatDayClock } from "@/lib/format";
import { CHART_MARGIN, makeTimeScale } from "../charts/scales";
import { useScrub } from "../charts/ScrubContext";
import { useScrubHover } from "../charts/useScrubHover";
import { useScrubKeyboard } from "../charts/useScrubKeyboard";
import styles from "./mapTimeAxis.module.css";

export interface MapTimeAxisProps {
  /** Timeseries timestamps, parallel-indexed with the shared scrub index. */
  pointTimes: string[];
  /** Timeseries index closest to the current real-time "now". */
  nowIndex: number;
}

/** Width below which we switch to a mobile-sized strip (matches BayMap's
 *  arrow-scaling breakpoint). On mobile the now line / crosshair is at least
 *  44 px tall so a fingertip pressing the line doesn't cover the time label
 *  above it. */
const MOBILE_BREAKPOINT = 640;
const MOBILE_HEIGHT = 80;
const MOBILE_AXIS_Y = 60;
const DESKTOP_HEIGHT = 60;
const DESKTOP_AXIS_Y = 32;
/** Baseline of the hovered-time / "Now" label sitting above the crosshair. */
const LABEL_Y = 12;
/** Horizontal half-width used to clamp/align the label near the strip ends. */
const LABEL_HALF_W = 44;

const axisColor = "var(--chart-axis)";
const tickLabelProps = {
  fill: axisColor,
  fontSize: 10,
  fontFamily: "inherit",
  textAnchor: "middle",
} as const;

/**
 * Thin time-axis strip rendered directly under the bay map. Visually mirrors
 * the chart x-axis (same scale + tick formatter), and acts as a third scrub
 * surface alongside the chart stack: hover / touch-drag updates the shared
 * `ScrubContext`, releasing returns to "now". Exposed to assistive tech as
 * a horizontal slider whose value is a forecast time.
 *
 * The visual frame (background, border, rounded bottom corners) lives on the
 * outer `.strip` wrapper so the placeholder and rendered states share the
 * same look — there's no unstyled gap below the map during loading.
 */
export function MapTimeAxis(props: MapTimeAxisProps) {
  return (
    <div className={styles.strip}>
      <ParentSize debounceTime={0} style={{ width: "100%" }}>
        {({ width }) =>
          width > 1 && props.pointTimes.length > 0 ? (
            <Inner width={width} {...props} />
          ) : (
            <div className={styles.placeholder} aria-hidden="true" />
          )
        }
      </ParentSize>
    </div>
  );
}

function Inner({
  width,
  pointTimes,
  nowIndex,
}: MapTimeAxisProps & { width: number }) {
  const { hoveredIndex } = useScrub();
  const lastIndex = pointTimes.length - 1;
  const onKeyDown = useScrubKeyboard(nowIndex, lastIndex);

  const isMobile = width < MOBILE_BREAKPOINT;
  const height = isMobile ? MOBILE_HEIGHT : DESKTOP_HEIGHT;
  const axisY = isMobile ? MOBILE_AXIS_Y : DESKTOP_AXIS_Y;

  const times = useMemo(
    () => pointTimes.map((t) => new Date(t)),
    [pointTimes],
  );

  const xScale = useMemo(
    () =>
      makeTimeScale(
        [times[0], times[times.length - 1]],
        [CHART_MARGIN.left, width - CHART_MARGIN.right],
      ),
    [times, width],
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);

  const hoverHandlers = useScrubHover({
    svgRef,
    hitRef,
    xScale,
    times,
    dataLength: pointTimes.length,
  });

  const innerWidth = Math.max(1, width - CHART_MARGIN.left - CHART_MARGIN.right);

  const safeNowIndex = Math.min(nowIndex, lastIndex);
  const nowX = xScale(times[safeNowIndex]);
  const showNow = nowX >= CHART_MARGIN.left && nowX <= width - CHART_MARGIN.right;

  const hovered =
    hoveredIndex != null && hoveredIndex <= lastIndex ? hoveredIndex : null;
  const hoveredX = hovered != null ? xScale(times[hovered]) : null;
  const hoveredLabel = hovered != null ? formatDayClock(pointTimes[hovered]) : "";
  const valueIndex = hovered ?? safeNowIndex;
  const valueText =
    hovered != null
      ? `${hoveredLabel}, scrubbing`
      : `${formatDayClock(pointTimes[safeNowIndex])}, now`;

  // Anchor a label so it never clips at the strip edges: if the underlying
  // line is too close to a side, switch from center-anchored to
  // start/end-anchored and pin to the corresponding margin.
  const anchorAtX = (x: number) => {
    if (x - LABEL_HALF_W < CHART_MARGIN.left) {
      return { x: CHART_MARGIN.left, anchor: "start" as const };
    }
    if (x + LABEL_HALF_W > width - CHART_MARGIN.right) {
      return { x: width - CHART_MARGIN.right, anchor: "end" as const };
    }
    return { x, anchor: "middle" as const };
  };
  const hoverAnchor = hoveredX != null ? anchorAtX(hoveredX) : null;
  const nowAnchor = showNow ? anchorAtX(nowX) : null;

  return (
    <div
      ref={hitRef}
      className={styles.surface}
      tabIndex={0}
      role="slider"
      aria-label="Forecast time"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={lastIndex}
      aria-valuenow={valueIndex}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      {...hoverHandlers}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        {showNow && (
          <Line
            className={styles.nowLine}
            from={{ x: nowX, y: LABEL_Y + 4 }}
            to={{ x: nowX, y: axisY }}
          />
        )}

        {/* "Now" label sits above the now line so the strip is self-
            documenting. Hidden while scrubbing so it doesn't compete with
            the hover label at the same y. */}
        {nowAnchor && hovered == null && (
          <text
            className={styles.nowLabel}
            x={nowAnchor.x}
            y={LABEL_Y}
            textAnchor={nowAnchor.anchor}
          >
            Now
          </text>
        )}

        <AxisBottom
          scale={xScale}
          top={axisY}
          numTicks={Math.max(3, Math.floor(innerWidth / 80))}
          tickFormat={(value) => formatAxisTick(value as Date)}
          stroke={axisColor}
          tickStroke={axisColor}
          tickLength={4}
          tickLabelProps={tickLabelProps}
        />

        {hoveredX != null && hoverAnchor && (
          <g>
            <Line
              className={styles.crosshair}
              from={{ x: hoveredX, y: LABEL_Y + 4 }}
              to={{ x: hoveredX, y: axisY }}
            />
            <circle
              className={styles.hoverDot}
              cx={hoveredX}
              cy={axisY}
              r={4}
            />
            <text
              className={styles.hoverLabel}
              x={hoverAnchor.x}
              y={LABEL_Y}
              textAnchor={hoverAnchor.anchor}
            >
              {hoveredLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
