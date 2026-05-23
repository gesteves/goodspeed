import type { TideEvent } from "@/lib/derive/tides";
import type { TimeseriesPoint } from "@/lib/schema";
import styles from "./charts.module.css";
import type { ChartScales } from "./TimeSeriesChart";

/** High (H) / low (L) glyphs on the tide curve at each extremum. */
export function TideMarkers({
  events,
  data,
  accessor,
  scales,
}: {
  events: TideEvent[];
  data: TimeseriesPoint[];
  accessor: (p: TimeseriesPoint) => number;
  scales: ChartScales;
}) {
  return (
    <g>
      {events.map((e) => {
        const x = scales.xScale(new Date(e.t));
        const y = scales.yScale(accessor(data[e.index]));
        const high = e.type === "high";
        const dir = high ? -1 : 1;
        const tip = y + dir * 4;
        const base = y + dir * 12;
        return (
          <g key={e.index}>
            <polygon
              className={styles.tideMarker}
              data-type={e.type}
              points={`${x},${tip} ${x - 5},${base} ${x + 5},${base}`}
            />
            <text
              className={styles.tideLetter}
              x={x}
              y={y + dir * 22}
              textAnchor="middle"
            >
              {high ? "H" : "L"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
