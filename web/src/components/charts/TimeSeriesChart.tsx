import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Line, LinePath } from "@visx/shape";
import { useMemo, useRef, type ReactNode } from "react";
import { formatAxisTick } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/schema";
import styles from "./charts.module.css";
import { CHART_MARGIN, type TimeScale } from "./scales";
import { useScrub } from "./ScrubContext";
import { useScrubHover } from "./useScrubHover";

type LinearScale = ReturnType<typeof scaleLinear<number>>;

export interface ChartScales {
  xScale: TimeScale;
  yScale: LinearScale;
  times: Date[];
}

export interface TimeSeriesChartProps {
  data: TimeseriesPoint[];
  times: Date[];
  width: number;
  height: number;
  xScale: TimeScale;
  accessor: (p: TimeseriesPoint) => number;
  /** CSS color for the line/area and label swatch. */
  color: string;
  label: string;
  /** Value readout shown in the chart's top-right corner. */
  readout: ReactNode;
  /** Fill the area under the line. */
  area?: boolean;
  nowIndex: number;
  /** Fraction of the value range added as headroom above and below. */
  yPadFactor?: number;
  /** Extra marks (e.g. tide markers) drawn over the series. */
  children?: (scales: ChartScales) => ReactNode;
}

const axisColor = "var(--chart-axis)";
const tickLabelProps = {
  fill: axisColor,
  fontSize: 10,
  fontFamily: "inherit",
} as const;

export function TimeSeriesChart({
  data,
  times,
  width,
  height,
  xScale,
  accessor,
  color,
  label,
  readout,
  area = false,
  nowIndex,
  yPadFactor = 0.14,
  children,
}: TimeSeriesChartProps) {
  const { hoveredIndex } = useScrub();
  const m = CHART_MARGIN;
  const innerWidth = Math.max(1, width - m.left - m.right);
  const innerHeight = Math.max(1, height - m.top - m.bottom);
  const plotBottom = m.top + innerHeight;

  const yScale = useMemo<LinearScale>(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of data) {
      const v = accessor(p);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const pad = (max - min) * yPadFactor || 1;
    return scaleLinear<number>({
      domain: [min - pad, max + pad],
      range: [plotBottom, m.top],
    });
  }, [data, accessor, plotBottom, m.top, yPadFactor]);

  const x = (i: number) => xScale(times[i]);
  const y = (p: TimeseriesPoint) => yScale(accessor(p));

  const nowX = x(Math.min(nowIndex, data.length - 1));

  const svgRef = useRef<SVGSVGElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);

  const hoverHandlers = useScrubHover({
    svgRef,
    hitRef,
    xScale,
    times,
    dataLength: data.length,
  });

  const hovered =
    hoveredIndex != null && hoveredIndex < data.length ? hoveredIndex : null;

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartHead}>
        <span className={styles.chartLabelGroup}>
          <span
            className={styles.swatch}
            style={{ background: color }}
            aria-hidden="true"
          />
          <h3 className={styles.chartLabel}>{label}</h3>
        </span>
        {readout}
      </figcaption>

      {/* HTML hit area: iOS Safari fires pointer events and honours
          touch-action reliably on HTML elements, but not on SVG <rect>
          children — so capture the gesture here and translate the
          coordinate against the SVG's bounding rect. */}
      <div ref={hitRef} className={styles.hitArea} {...hoverHandlers}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={`${label} over the forecast window`}
      >
        <title>{`${label} over the forecast window`}</title>
        <GridRows
          scale={yScale}
          left={m.left}
          width={innerWidth}
          numTicks={4}
          stroke="var(--chart-grid)"
        />

        {/* "Now" marker */}
        {nowX >= m.left && nowX <= width - m.right && (
          <Line
            className={styles.nowLine}
            from={{ x: nowX, y: m.top }}
            to={{ x: nowX, y: plotBottom }}
          />
        )}

        {area && (
          <AreaClosed
            data={data}
            x={(_, i) => x(i)}
            y={y}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={color}
            fillOpacity={0.16}
            stroke="transparent"
          />
        )}
        <LinePath
          data={data}
          x={(_, i) => x(i)}
          y={y}
          curve={curveMonotoneX}
          stroke={color}
          strokeWidth={2}
          fill="none"
        />

        {children?.({ xScale, yScale, times })}

        {/* Scrub crosshair */}
        {hovered != null && (
          <g>
            <Line
              className={styles.crosshair}
              from={{ x: x(hovered), y: m.top }}
              to={{ x: x(hovered), y: plotBottom }}
            />
            <circle
              cx={x(hovered)}
              cy={y(data[hovered])}
              r={4}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          </g>
        )}

        <AxisLeft
          scale={yScale}
          left={m.left}
          numTicks={4}
          stroke={axisColor}
          tickStroke={axisColor}
          tickLength={4}
          tickLabelProps={{ ...tickLabelProps, textAnchor: "end", dx: -2 }}
        />

        <AxisBottom
          scale={xScale}
          top={plotBottom}
          numTicks={Math.max(3, Math.floor(innerWidth / 80))}
          tickFormat={(value) => formatAxisTick(value as Date)}
          stroke={axisColor}
          tickStroke={axisColor}
          tickLength={4}
          tickLabelProps={{ ...tickLabelProps, textAnchor: "middle" }}
        />

      </svg>
      </div>
    </figure>
  );
}
