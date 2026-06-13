import { useMemo } from "react";
import { compass16 } from "@/lib/angles";
import { classifyCurrent } from "@/lib/derive/currents";
import type { TideEvent } from "@/lib/derive/tides";
import { formatDayClock, formatNumber } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/schema";
import {
  METRICS,
  readMetric,
  unitField,
  type MetricKey,
  type UnitSystem,
} from "@/lib/units/units";
import { useUnits } from "../providers/UnitsProvider";
import { ArrowTimeline } from "./ArrowTimeline";
import styles from "./charts.module.css";
import { MeasuredWidth } from "./MeasuredWidth";
import { CHART_MARGIN, makeTimeScale } from "./scales";
import { useScrub } from "./ScrubContext";
import { useScrubKeyboard } from "./useScrubKeyboard";
import { TideMarkers } from "./TideMarkers";
import { TimeSeriesChart } from "./TimeSeriesChart";

export interface ForecastChartsProps {
  data: TimeseriesPoint[];
  nowIndex: number;
  /** Label for the reference marker when not scrubbing ("Now" or a race time). */
  nowLabel?: string;
  tideEvents: TideEvent[];
}

const CHART_HEIGHT = 134;

const DECIMALS: Record<MetricKey, number> = {
  waterTemp: 1,
  currentSpeed: 2,
  waterLevel: 1,
  windSpeed: 1,
};

// Arrow accessors. Current arrows point the way the water flows (toward) and
// are coloured flood/ebb; wind arrows point the way the wind blows (downwind).
const currentBearing = (p: TimeseriesPoint) => p.current_bearing_deg;
const currentColor = (p: TimeseriesPoint) =>
  classifyCurrent(p) === "flood" ? "var(--flood)" : "var(--ebb)";
const currentSlack = (p: TimeseriesPoint) => classifyCurrent(p) === "slack";

const windDownwind = (p: TimeseriesPoint) => (p.wind_bearing_deg + 180) % 360;
const windColor = () => "var(--chart-wind)";

/**
 * Top-right corner readout: the value (in the selected units) at the scrubbed
 * point, with the point's time beneath it.
 */
function MetricReadout({
  metricKey,
  point,
  units,
  time,
}: {
  metricKey: MetricKey;
  point: TimeseriesPoint;
  units: UnitSystem;
  time: string;
}) {
  const metric = METRICS[metricKey];
  return (
    <span className={styles.readout} aria-live="polite">
      <span className={styles.readoutMain}>
        <span className={`${styles.readoutValue} tnum`}>
          {formatNumber(readMetric(point, metric, units), DECIMALS[metricKey])}
        </span>
        <span className={styles.readoutUnit}>
          {unitField(metric, units).unit}
        </span>
      </span>
      <span className={styles.readoutTime}>{time}</span>
    </span>
  );
}

/** Corner readout for a direction strip. */
function DirectionReadout({
  degrees,
  relation,
  compass,
  time,
  slack = false,
}: {
  degrees: number;
  relation: string;
  compass: string;
  time: string;
  /** When true, suppress the degree/compass values and show "Slack". */
  slack?: boolean;
}) {
  return (
    <span className={styles.readout} aria-live="polite">
      <span className={styles.readoutMain}>
        {slack ? (
          <>
            <span className={`${styles.readoutValue} tnum`}>–°</span>
            <span className={styles.readoutUnit}>slack</span>
          </>
        ) : (
          <>
            <span className={`${styles.readoutValue} tnum`}>{degrees}°</span>
            <span className={styles.readoutUnit}>
              {relation} {compass}
            </span>
          </>
        )}
      </span>
      <span className={styles.readoutTime}>{time}</span>
    </span>
  );
}

/**
 * The actual six-row chart stack. Split from `ForecastCharts` so it only
 * renders once `<MeasuredWidth>` has measured a non-zero width -- visx chart
 * setup is wasted work at width 0.
 *
 * Order matters: stacked charts share a single x scale built from the
 * timeseries' time range, so every row aligns pixel-for-pixel on the time
 * axis (water temp, current speed, current arrows, tide w/ H/L markers, wind
 * speed, wind arrows).
 */
function ChartStack({
  width,
  data,
  nowIndex,
  nowLabel = "Now",
  tideEvents,
}: ForecastChartsProps & { width: number }) {
  const { units } = useUnits();
  const { hoveredIndex } = useScrub();
  const lastIndex = data.length - 1;

  // Keyboard scrub: arrow keys move the shared scrub index across the stack.
  // The container is focusable (tabIndex=0) and has an aria-label describing
  // the controls; readouts have aria-live="polite" so updates are announced.
  const onKeyDown = useScrubKeyboard(nowIndex, lastIndex);

  const times = useMemo(() => data.map((p) => new Date(p.t)), [data]);

  const xScale = useMemo(
    () =>
      makeTimeScale(
        [times[0], times[times.length - 1]],
        [CHART_MARGIN.left, width - CHART_MARGIN.right],
      ),
    [times, width],
  );

  const accessors = useMemo(
    () => ({
      temp: (p: TimeseriesPoint) => readMetric(p, METRICS.waterTemp, units),
      current: (p: TimeseriesPoint) =>
        readMetric(p, METRICS.currentSpeed, units),
      tide: (p: TimeseriesPoint) => readMetric(p, METRICS.waterLevel, units),
      wind: (p: TimeseriesPoint) => readMetric(p, METRICS.windSpeed, units),
    }),
    [units],
  );

  // The readouts show the scrubbed point, or the marker (now / race) otherwise.
  const displayIndex = Math.min(hoveredIndex ?? nowIndex, lastIndex);
  const dp = data[displayIndex];
  const timeLabel = hoveredIndex != null ? formatDayClock(dp.t) : nowLabel;

  const common = { data, times, width, xScale, nowIndex };

  return (
    <div
      className={styles.plot}
      tabIndex={0}
      role="group"
      aria-label="Forecast charts. Use arrow keys to scrub; Shift+Arrow to jump by an hour; Home and End for the ends; Escape to release."
      onKeyDown={onKeyDown}
    >
      <TimeSeriesChart
        {...common}
        height={CHART_HEIGHT}
        accessor={accessors.temp}
        color="var(--chart-temp)"
        label="Water temperature"
        readout={
          <MetricReadout
            metricKey="waterTemp"
            point={dp}
            units={units}
            time={timeLabel}
          />
        }
      />
      <TimeSeriesChart
        {...common}
        height={CHART_HEIGHT}
        accessor={accessors.current}
        color="var(--chart-current)"
        label="Current speed"
        area
        readout={
          <MetricReadout
            metricKey="currentSpeed"
            point={dp}
            units={units}
            time={timeLabel}
          />
        }
      />
      <ArrowTimeline
        {...common}
        label="Current direction"
        swatchColor="var(--chart-current)"
        bearing={currentBearing}
        color={currentColor}
        isSlack={currentSlack}
        readout={
          <DirectionReadout
            degrees={Math.round(dp.current_bearing_deg)}
            relation={
              classifyCurrent(dp) === "flood" ? "flooding" : "ebbing"
            }
            compass={compass16(dp.current_bearing_deg)}
            time={timeLabel}
            slack={classifyCurrent(dp) === "slack"}
          />
        }
      />
      <TimeSeriesChart
        {...common}
        height={CHART_HEIGHT}
        accessor={accessors.tide}
        color="var(--chart-tide)"
        label="Tide"
        area
        yPadFactor={0.32}
        readout={
          <MetricReadout
            metricKey="waterLevel"
            point={dp}
            units={units}
            time={timeLabel}
          />
        }
      >
        {(scales) => (
          <TideMarkers
            events={tideEvents}
            data={data}
            accessor={accessors.tide}
            scales={scales}
          />
        )}
      </TimeSeriesChart>
      <TimeSeriesChart
        {...common}
        height={CHART_HEIGHT}
        accessor={accessors.wind}
        color="var(--chart-wind)"
        label="Wind speed"
        readout={
          <MetricReadout
            metricKey="windSpeed"
            point={dp}
            units={units}
            time={timeLabel}
          />
        }
      />
      <ArrowTimeline
        {...common}
        label="Wind direction"
        swatchColor="var(--chart-wind)"
        bearing={windDownwind}
        color={windColor}
        readout={
          <DirectionReadout
            degrees={Math.round(dp.wind_bearing_deg)}
            relation="from"
            compass={compass16(dp.wind_bearing_deg)}
            time={timeLabel}
          />
        }
      />
    </div>
  );
}

/**
 * Forecast section: a stack of time-aligned charts covering the next ~48 h
 * (water temperature, current speed + direction, tide, wind speed +
 * direction). Re-renders on a units or scrub change.
 */
export function ForecastCharts(props: ForecastChartsProps) {
  return (
    <section className={styles.section} aria-label="48-hour forecast">
      <div className={styles.stack}>
        <MeasuredWidth>
          {({ width }) =>
            width > 1 && props.data.length > 0 ? (
              <ChartStack width={width} {...props} />
            ) : (
              <div className={styles.placeholder} />
            )
          }
        </MeasuredWidth>
      </div>
    </section>
  );
}

/**
 * Pre-data placeholder for `ForecastCharts`. Reserves the chart stack's full
 * height (4 charts + 2 arrow timelines) so data arrival doesn't cause CLS.
 */
export function ForecastChartsSkeleton() {
  return (
    <section
      className={styles.section}
      aria-label="48-hour forecast"
      aria-busy="true"
    >
      <div className={styles.stack}>
        <div className={styles.placeholder} />
      </div>
    </section>
  );
}
