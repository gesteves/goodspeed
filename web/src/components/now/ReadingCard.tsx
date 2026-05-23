import type { ReactNode } from "react";
import styles from "./now.module.css";

/** A single current-conditions stat: label, big value, optional sub-line. */
export function ReadingCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: ReactNode;
  /** CSS color (e.g. a `var(--chart-*)`) for the label swatch. */
  accent?: string;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {accent && (
          <span
            className={styles.swatch}
            style={{ background: accent }}
            aria-hidden="true"
          />
        )}
        <h3 className={styles.cardLabel}>{label}</h3>
      </div>
      <div className={styles.value}>
        <span className={`${styles.number} tnum`}>{value}</span>
        <span className={styles.unit}>{unit}</span>
      </div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}
