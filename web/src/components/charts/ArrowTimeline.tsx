import { AxisBottom } from "@visx/axis";
import { localPoint } from "@visx/event";
import { Bar, Line } from "@visx/shape";
import { useMemo, type PointerEvent, type ReactNode } from "react";

const ARROW_LENGTH = 16;
import { formatAxisTick } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/schema";
import styles from "./charts.module.css";
import { CHART_MARGIN, type TimeScale } from "./scales";
import { useScrub } from "./ScrubContext";

const HEIGHT = 80;

export interface ArrowTimelineProps {
  data: TimeseriesPoint[];
  times: Date[];
  width: number;
  xScale: TimeScale;
  nowIndex: number;
  label: string;
  /** CSS color for the label swatch. */
  swatchColor: string;
  /** Value readout shown in the top-right corner. */
  readout: ReactNode;
  /** Compass bearing each arrow points toward (degrees). */
  bearing: (p: TimeseriesPoint) => number;
  /** CSS color for each arrow. */
  color: (p: TimeseriesPoint) => string;
  /** When true for a point, draw a hollow dot instead of an arrow. */
  isSlack?: (p: TimeseriesPoint) => boolean;
}

/**
 * A strip of arrows -- one roughly every ~26px -- each pointing a compass
 * direction. Used for current set and wind direction. Shares the x scale and
 * scrub state with the stacked charts.
 */
export function ArrowTimeline({
  data,
  times,
  width,
  xScale,
  nowIndex,
  label,
  swatchColor,
  readout,
  bearing,
  color,
  isSlack,
}: ArrowTimelineProps) {
  const { hoveredIndex, setHoveredIndex } = useScrub();
  const m = CHART_MARGIN;
  const innerWidth = Math.max(1, width - m.left - m.right);
  const bandHeight = HEIGHT - m.top - m.bottom;
  const cy = m.top + bandHeight / 2;

  // One arrow every ~26px, at least hourly (6-min cadence -> step 10).
  const indices = useMemo(() => {
    const target = Math.max(6, Math.floor(innerWidth / 26));
    const step = Math.max(10, Math.round(data.length / target));
    const out: number[] = [];
    for (let i = 0; i < data.length; i += step) out.push(i);
    return out;
  }, [data.length, innerWidth]);

  const lastIndex = data.length - 1;
  const nowX = xScale(times[Math.min(nowIndex, lastIndex)]);

  const handleMove = (event: PointerEvent<SVGRectElement>) => {
    const point = localPoint(event);
    if (!point) return;
    const t = xScale.invert(point.x).getTime();
    const t0 = times[0].getTime();
    const step = times.length > 1 ? times[1].getTime() - t0 : 360_000;
    const idx = Math.round((t - t0) / step);
    setHoveredIndex(Math.max(0, Math.min(lastIndex, idx)));
  };

  const hovered =
    hoveredIndex != null && hoveredIndex <= lastIndex ? hoveredIndex : null;

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartHead}>
        <span className={styles.chartLabelGroup}>
          <span
            className={styles.swatch}
            style={{ background: swatchColor }}
            aria-hidden="true"
          />
          <h3 className={styles.chartLabel}>{label}</h3>
        </span>
        {readout}
      </figcaption>

      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${label} over the forecast window`}
      >
        <title>{`${label} over the forecast window`}</title>
        {nowX >= m.left && nowX <= width - m.right && (
          <Line
            className={styles.nowLine}
            from={{ x: nowX, y: m.top }}
            to={{ x: nowX, y: m.top + bandHeight }}
          />
        )}

        {indices.map((i) => {
          const p = data[i];
          const cx = xScale(times[i]);
          if (isSlack?.(p)) {
            return (
              <circle
                key={i}
                className={styles.arrowSlack}
                cx={cx}
                cy={cy}
                r={3}
              />
            );
          }
          const len = ARROW_LENGTH;
          const c = color(p);
          return (
            <g key={i} transform={`rotate(${bearing(p)} ${cx} ${cy})`}>
              <line
                className={styles.arrowShaft}
                stroke={c}
                x1={cx}
                y1={cy + len / 2}
                x2={cx}
                y2={cy - len / 2}
              />
              <polygon
                fill={c}
                points={`${cx},${cy - len / 2 - 4} ${cx - 4},${cy - len / 2 + 3} ${cx + 4},${cy - len / 2 + 3}`}
              />
            </g>
          );
        })}

        {hovered != null && (
          <Line
            className={styles.crosshair}
            from={{ x: xScale(times[hovered]), y: m.top }}
            to={{ x: xScale(times[hovered]), y: m.top + bandHeight }}
          />
        )}

        <AxisBottom
          scale={xScale}
          top={m.top + bandHeight}
          numTicks={Math.max(3, Math.floor(innerWidth / 80))}
          tickFormat={(value) => formatAxisTick(value as Date)}
          stroke="var(--chart-axis)"
          tickStroke="var(--chart-axis)"
          tickLength={4}
          tickLabelProps={{
            fill: "var(--chart-axis)",
            fontSize: 10,
            fontFamily: "inherit",
            textAnchor: "middle",
          }}
        />

        <Bar
          x={m.left}
          y={m.top}
          width={innerWidth}
          height={bandHeight}
          fill="transparent"
          style={{ touchAction: "pan-y" }}
          onPointerMove={handleMove}
          onPointerDown={handleMove}
          onPointerLeave={() => setHoveredIndex(null)}
          onPointerCancel={() => setHoveredIndex(null)}
        />
      </svg>
    </figure>
  );
}
