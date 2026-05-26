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

const HEIGHT = 60;
/** Y of the axis baseline. The visx AxisBottom draws labels below this. */
const AXIS_Y = 32;
/** Baseline of the hovered-time label sitting above the crosshair. */
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
 */
export function MapTimeAxis(props: MapTimeAxisProps) {
  return (
    <ParentSize debounceTime={0} style={{ width: "100%" }}>
      {({ width }) =>
        width > 1 && props.pointTimes.length > 0 ? (
          <Inner width={width} {...props} />
        ) : (
          <div className={styles.placeholder} />
        )
      }
    </ParentSize>
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

  const nowX = xScale(times[Math.min(nowIndex, lastIndex)]);
  const showNow = nowX >= CHART_MARGIN.left && nowX <= width - CHART_MARGIN.right;

  const hovered =
    hoveredIndex != null && hoveredIndex <= lastIndex ? hoveredIndex : null;
  const hoveredX = hovered != null ? xScale(times[hovered]) : null;
  const hoveredLabel = hovered != null ? formatDayClock(pointTimes[hovered]) : "";
  const valueIndex = hovered ?? Math.min(nowIndex, lastIndex);
  const valueText =
    hovered != null
      ? `${hoveredLabel}, scrubbing`
      : `${formatDayClock(pointTimes[Math.min(nowIndex, lastIndex)])}, now`;

  // Anchor the label so it never clips at the strip edges: if the crosshair
  // is too close to a side, switch from center-anchored to start/end-anchored
  // and pin to the corresponding margin.
  let labelX = hoveredX ?? 0;
  let labelAnchor: "start" | "middle" | "end" = "middle";
  if (hoveredX != null) {
    if (hoveredX - LABEL_HALF_W < CHART_MARGIN.left) {
      labelAnchor = "start";
      labelX = CHART_MARGIN.left;
    } else if (hoveredX + LABEL_HALF_W > width - CHART_MARGIN.right) {
      labelAnchor = "end";
      labelX = width - CHART_MARGIN.right;
    }
  }

  return (
    <div
      ref={hitRef}
      className={styles.strip}
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
        height={HEIGHT}
        aria-hidden="true"
        focusable="false"
      >
        {showNow && (
          <Line
            className={styles.nowLine}
            from={{ x: nowX, y: 0 }}
            to={{ x: nowX, y: AXIS_Y }}
          />
        )}

        <AxisBottom
          scale={xScale}
          top={AXIS_Y}
          numTicks={Math.max(3, Math.floor(innerWidth / 80))}
          tickFormat={(value) => formatAxisTick(value as Date)}
          stroke={axisColor}
          tickStroke={axisColor}
          tickLength={4}
          tickLabelProps={tickLabelProps}
        />

        {hoveredX != null && (
          <g>
            <Line
              className={styles.crosshair}
              from={{ x: hoveredX, y: LABEL_Y + 4 }}
              to={{ x: hoveredX, y: AXIS_Y }}
            />
            <circle
              className={styles.hoverDot}
              cx={hoveredX}
              cy={AXIS_Y}
              r={4}
            />
            <text
              className={styles.hoverLabel}
              x={labelX}
              y={LABEL_Y}
              textAnchor={labelAnchor}
            >
              {hoveredLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
