import { faWater } from "@fortawesome/pro-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { compass8Word } from "@/lib/angles";
import { classifyCurrent } from "@/lib/derive/currents";
import { formatNumber } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/schema";
import {
  METRICS,
  readMetric,
  unitField,
  type UnitSystem,
} from "@/lib/units/units";
import styles from "./now.module.css";

const PHASE_LABEL: Record<string, string> = {
  flood: "Flooding",
  ebb: "Ebbing",
  slack: "Slack",
};

/** The "now" current card: speed, with flood/ebb and set in the sub-line. */
export function CurrentNowCard({
  point,
  units,
}: {
  point: TimeseriesPoint;
  units: UnitSystem;
}) {
  const phase = classifyCurrent(point);
  const speed = readMetric(point, METRICS.currentSpeed, units);
  const unit = unitField(METRICS.currentSpeed, units).unit;

  const sub =
    phase === "slack"
      ? "Slack · Minimal current"
      : `${PHASE_LABEL[phase]} ${compass8Word(
          point.current_bearing_deg,
        )}`;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <FontAwesomeIcon
          icon={faWater}
          className={styles.cardIcon}
          style={{ color: "var(--chart-current)" }}
          aria-hidden="true"
        />
        <h3 className={styles.cardLabel}>Current</h3>
      </div>
      <div className={styles.value}>
        <span className={`${styles.number} tnum`}>
          {formatNumber(speed, 1)}
        </span>
        <span className={styles.unit}>{unit}</span>
      </div>
      <div className={styles.sub}>{sub}</div>
    </div>
  );
}
