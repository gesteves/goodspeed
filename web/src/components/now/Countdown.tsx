import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";
import styles from "./now.module.css";

/**
 * Live countdown to `target`, ticking once a second. Kept as its own component
 * with its own interval so the per-second updates don't re-run the Dashboard's
 * heavier derivations (those stay on the 30s/60s cadence). Once `target` is
 * reached it shows "Underway".
 */
export function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const diff = target.getTime() - now;
  return (
    <span className={styles.countdown}>
      {diff > 0 ? formatCountdown(diff) : "Underway"}
    </span>
  );
}
