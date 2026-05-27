import { tempColorStops, tempDomainLabels } from "@/lib/colors";
import type { UnitSystem } from "@/lib/units/units";
import styles from "./bayMap.module.css";

/** Overlay legend: water-temperature color ramp. */
export function MapLegend({ units }: { units: UnitSystem }) {
  const labels = tempDomainLabels(units);
  const gradient = `linear-gradient(to right, ${tempColorStops(9).join(", ")})`;
  return (
    <div className={styles.legend} aria-label="Map legend">
      <div className={styles.legendBlock}>
        <span className={styles.legendCaption}>Water Temperature</span>
        <div className={styles.legendRamp}>
          <span className={styles.legendLabel}>{labels.min}</span>
          <span className={styles.legendBar} style={{ background: gradient }} />
          <span className={styles.legendLabel}>{labels.max}</span>
        </div>
      </div>
    </div>
  );
}
