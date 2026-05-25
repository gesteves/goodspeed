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

const SKELETON_CARDS: { label: string; accent: string; hasSub: boolean }[] = [
  { label: "Water temperature", accent: "var(--chart-temp)", hasSub: false },
  { label: "Current", accent: "var(--chart-current)", hasSub: true },
  { label: "Tide", accent: "var(--chart-tide)", hasSub: true },
  { label: "Wind", accent: "var(--chart-wind)", hasSub: true },
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
        {SKELETON_CARDS.map(({ label, accent, hasSub }) => (
          <div key={label} className={styles.card}>
            <div className={styles.cardHead}>
              <span
                className={styles.swatch}
                style={{ background: accent }}
                aria-hidden="true"
              />
              <h3 className={styles.cardLabel}>{label}</h3>
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

export function NowPanel({ now, point, trend, nextTide }: NowPanelProps) {
  const { units } = useUnits();

  const temp = readMetric(point, METRICS.waterTemp, units);
  const level = readMetric(point, METRICS.waterLevel, units);
  const wind = readMetric(point, METRICS.windSpeed, units);

  const tideSub = nextTide
    ? `${nextTide.type === "high" ? "High" : "Low"} at ${formatClock(nextTide.t)}`
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
              {tideSub ? ` · ${tideSub}` : ""}
            </>
          }
        />
        <ReadingCard
          label="Wind"
          accent="var(--chart-wind)"
          value={formatNumber(wind, 1)}
          unit={unitField(METRICS.windSpeed, units).unit}
          sub={`From ${compass16(point.wind_bearing_deg)}`}
        />
      </div>
    </section>
  );
}
