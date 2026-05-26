import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import styles from "./now.module.css";

/** A single current-conditions stat: label, big value, optional sub-line. */
export function ReadingCard({
  label,
  shortLabel,
  icon,
  iconColor,
  value,
  unit,
  sub,
}: {
  label: string;
  /** Shorter label shown when the card is narrow (container <220px). */
  shortLabel?: string;
  icon: IconDefinition;
  /** CSS color (e.g. a `var(--chart-*)`) used to tint the label icon. */
  iconColor?: string;
  value: string;
  unit: string;
  sub?: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <FontAwesomeIcon
          icon={icon}
          className={styles.cardIcon}
          style={iconColor ? { color: iconColor } : undefined}
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
        <span className={`${styles.number} tnum`}>{value}</span>
        <span className={styles.unit}>{unit}</span>
      </div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}
