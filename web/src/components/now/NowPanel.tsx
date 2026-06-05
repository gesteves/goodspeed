import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faTemperatureArrowDown,
  faTemperatureArrowUp,
  faTemperatureHalf,
  faWater,
  faWaterArrowDown,
  faWaterArrowUp,
  faWind,
} from "@fortawesome/pro-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { compass8Word } from "@/lib/angles";
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

type Trend = "rising" | "falling" | "steady";

const TEMP_ICON: Record<Trend, IconDefinition> = {
  rising: faTemperatureArrowUp,
  falling: faTemperatureArrowDown,
  steady: faTemperatureHalf,
};

const TIDE_ICON: Record<Trend, IconDefinition> = {
  rising: faWaterArrowUp,
  falling: faWaterArrowDown,
  steady: faWater,
};

export interface NowPanelProps {
  /** Panel heading, e.g. "Right now" or "Race day conditions". */
  title: string;
  /** `aria-label` for the panel `<section>`. */
  ariaLabel: string;
  /** Rendered beside the heading — the clock time, or a live countdown. */
  headerExtra: ReactNode;
  point: TimeseriesPoint;
  trend: Trend;
  tempTrend: Trend;
  nextTide: TideEvent | null;
}

const SKELETON_CARDS: {
  label: string;
  shortLabel?: string;
  icon: IconDefinition;
  accent: string;
  hasSub: boolean;
}[] = [
  {
    label: "Water temperature",
    shortLabel: "Water temp",
    icon: faTemperatureHalf,
    accent: "var(--chart-temp)",
    hasSub: true,
  },
  {
    label: "Current",
    icon: faWater,
    accent: "var(--chart-current)",
    hasSub: true,
  },
  {
    label: "Tide",
    icon: faWaterArrowUp,
    accent: "var(--chart-tide)",
    hasSub: true,
  },
  {
    label: "Wind",
    icon: faWind,
    accent: "var(--chart-wind)",
    hasSub: true,
  },
];

/**
 * Pre-data placeholder for `NowPanel`. Renders the same 4-card grid with
 * shimmering value blocks so the panel's height matches the real component
 * and there's no layout shift when data arrives.
 */
export function NowPanelSkeleton() {
  return (
    <section className={styles.panel} aria-label="Current conditions" aria-busy="true">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Right now</h2>
      </div>

      <div className={styles.grid}>
        {SKELETON_CARDS.map(({ label, shortLabel, icon, accent, hasSub }) => (
          <div key={label} className={styles.card}>
            <div className={styles.cardHead}>
              <FontAwesomeIcon
                icon={icon}
                className={styles.cardIcon}
                style={{ color: accent }}
                aria-hidden="true"
              />
              <h3 className={styles.cardLabel}>
                {shortLabel ? (
                  <>
                    <span className={styles.labelFull}>{label}</span>
                    <span className={styles.labelShort}>{shortLabel}</span>
                  </>
                ) : (
                  label
                )}
              </h3>
            </div>
            <div className={styles.value}>
              <span
                className={`${styles.skeletonBlock} ${styles.skeletonNumber}`}
                aria-hidden="true"
              />
              <span
                className={`${styles.skeletonBlock} ${styles.skeletonUnit}`}
                aria-hidden="true"
              />
            </div>
            {hasSub && (
              <span
                className={`${styles.skeletonBlock} ${styles.skeletonSub}`}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A 4-card conditions grid (water temp, current, tide, wind) showing the value
 * at `point`. Used twice: "Right now" (the timeseries entry closest to
 * wall-clock now, with the clock time in `headerExtra`) and "Race day
 * conditions" (the entry nearest the race start, with a live countdown). Trend
 * arrows on the temp + tide icons come from `levelTrend` / `tempTrend` in
 * `lib/derive/now.ts`. Re-renders whenever the Dashboard ticks its local clock
 * so the cards follow the user's clock, not the server's.
 */
export function NowPanel({
  title,
  ariaLabel,
  headerExtra,
  point,
  trend,
  tempTrend,
  nextTide,
}: NowPanelProps) {
  const { units } = useUnits();

  const temp = readMetric(point, METRICS.waterTemp, units);
  const level = readMetric(point, METRICS.waterLevel, units);
  const wind = readMetric(point, METRICS.windSpeed, units);

  const tideSub = nextTide
    ? `${nextTide.type === "high" ? "High" : "Low"} at ${formatClock(nextTide.t)}`
    : null;

  return (
    <section className={styles.panel} aria-label={ariaLabel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <span className={styles.panelTime}>{headerExtra}</span>
      </div>

      <div className={styles.grid}>
        <ReadingCard
          label="Water temperature"
          shortLabel="Water temp"
          icon={TEMP_ICON[tempTrend]}
          iconColor="var(--chart-temp)"
          value={formatNumber(temp, 1)}
          unit={unitField(METRICS.waterTemp, units).unit}
          sub={TREND_LABEL[tempTrend]}
        />
        <CurrentNowCard point={point} units={units} />
        <ReadingCard
          label="Tide"
          icon={TIDE_ICON[trend]}
          iconColor="var(--chart-tide)"
          value={formatNumber(level, 1)}
          unit={unitField(METRICS.waterLevel, units).unit}
          sub={
            <>
              {TREND_LABEL[trend]}
              {tideSub ? ` · ${tideSub}` : ""}
            </>
          }
        />
        <ReadingCard
          label="Wind"
          icon={faWind}
          iconColor="var(--chart-wind)"
          value={formatNumber(wind, 1)}
          unit={unitField(METRICS.windSpeed, units).unit}
          sub={`From the ${compass8Word(point.wind_bearing_deg)}`}
        />
      </div>
    </section>
  );
}
