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
import { Segmented } from "../Segmented";
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

/** The conditions shown by one tab: a timeseries point and its derived trends. */
export interface ConditionsData {
  point: TimeseriesPoint;
  trend: Trend;
  tempTrend: Trend;
  nextTide: TideEvent | null;
}

/** A `ConditionsData` plus the clock/countdown shown beside the switcher. */
export interface ConditionsTab extends ConditionsData {
  extra: ReactNode;
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
 * The 4-card conditions grid (water temp, current, tide, wind) showing the
 * value at `point`. Trend arrows on the temp + tide icons come from
 * `levelTrend` / `tempTrend` in `lib/derive/now.ts`.
 */
function ConditionsCards({ point, trend, tempTrend, nextTide }: ConditionsData) {
  const { units } = useUnits();

  const temp = readMetric(point, METRICS.waterTemp, units);
  const level = readMetric(point, METRICS.waterLevel, units);
  const wind = readMetric(point, METRICS.windSpeed, units);

  const tideSub = nextTide
    ? `${nextTide.type === "high" ? "High" : "Low"} at ${formatClock(nextTide.t)}`
    : null;

  return (
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
  );
}

export type TabKey = "now" | "race";

export interface ConditionsPanelProps {
  /** Live conditions at wall-clock "now" (clock time in `extra`). */
  now: ConditionsTab;
  /**
   * Forecast conditions at the race start (the formatted race date in `extra`),
   * or `null` when there's no usable forecast — no race configured, race already
   * started, or race still beyond the forecast window. Null → no tabs, just
   * "Right now".
   */
  race: ConditionsTab | null;
  /** The currently visible tab (controlled by the parent). */
  active: TabKey;
  /** Called when the user picks a tab. */
  onSelect: (tab: TabKey) => void;
}

/**
 * The conditions panel: the 4-card grid, plus — only when a race forecast is
 * actually available (`race` non-null) — a "Right now" / "Race day" switcher
 * (reusing `Segmented`) above it, showing one set of conditions at a time. With
 * no race forecast it's just the plain "Right now" panel, so stale/past or
 * not-yet-forecast race data is never shown.
 */
export function ConditionsPanel({
  now,
  race,
  active,
  onSelect,
}: ConditionsPanelProps) {
  // `race` is the source of truth for whether the switcher exists; the parent
  // already coerces `active` to "now" whenever `race` is null.
  const data = active === "race" && race ? race : now;

  return (
    <section className={styles.panel} aria-label="Conditions">
      <div className={styles.panelHead}>
        {race ? (
          <Segmented<TabKey>
            ariaLabel="Conditions view"
            value={active}
            onChange={onSelect}
            options={[
              { value: "now", label: "Right now", title: "Right now" },
              {
                value: "race",
                label: "Race day",
                title: "Race day conditions",
              },
            ]}
          />
        ) : (
          <h2 className={styles.panelTitle}>Right now</h2>
        )}
        <span className={styles.panelTime}>{data.extra}</span>
      </div>

      <ConditionsCards
        point={data.point}
        trend={data.trend}
        tempTrend={data.tempTrend}
        nextTide={data.nextTide}
      />
    </section>
  );
}
