"use client";

import { compass16 } from "@/lib/angles";
import type { TideEvent } from "@/lib/derive/tides";
import { formatClock, formatNumber } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/schema";
import { METRICS, readMetric, unitField } from "@/lib/units/units";
import { useUnits } from "../providers/UnitsProvider";
import { CurrentNowCard } from "./CurrentNowCard";
import { ReadingCard } from "./ReadingCard";
import styles from "./now.module.css";

const TREND_LABEL: Record<string, string> = {
  rising: "Rising",
  falling: "Falling",
  steady: "Steady",
};

export interface NowPanelProps {
  /** Current wall-clock time (ISO string), shown in the panel header. */
  now: string;
  point: TimeseriesPoint;
  trend: "rising" | "falling" | "steady";
  nextTide: TideEvent | null;
}

export function NowPanel({ now, point, trend, nextTide }: NowPanelProps) {
  const { units } = useUnits();

  const temp = readMetric(point, METRICS.waterTemp, units);
  const level = readMetric(point, METRICS.waterLevel, units);
  const wind = readMetric(point, METRICS.windSpeed, units);

  const tideSub = nextTide
    ? `${nextTide.type === "high" ? "next high" : "next low"} ~${formatClock(
        nextTide.t,
      )}`
    : null;

  return (
    <section className={styles.panel} aria-label="Current conditions">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Right now</h2>
        <span className={styles.panelTime}>{formatClock(now)}</span>
      </div>

      <div className={styles.grid}>
        <ReadingCard
          label="Water temperature"
          accent="var(--chart-temp)"
          value={formatNumber(temp, 1)}
          unit={unitField(METRICS.waterTemp, units).unit}
        />
        <CurrentNowCard point={point} units={units} />
        <ReadingCard
          label="Tide"
          accent="var(--chart-tide)"
          value={formatNumber(level, 1)}
          unit={unitField(METRICS.waterLevel, units).unit}
          sub={
            <>
              {TREND_LABEL[trend]}
              {tideSub ? `, ${tideSub}` : ""}
            </>
          }
        />
        <ReadingCard
          label="Wind"
          accent="var(--chart-wind)"
          value={formatNumber(wind, 1)}
          unit={unitField(METRICS.windSpeed, units).unit}
          sub={`${Math.round(point.wind_bearing_deg)}° from the ${compass16(
            point.wind_bearing_deg,
          )}`}
        />
      </div>
    </section>
  );
}
