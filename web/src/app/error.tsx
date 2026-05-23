"use client";

import styles from "./error.module.css";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Conditions unavailable</h1>
        <p className={styles.body}>
          The Goodspeed feed couldn&rsquo;t be loaded right now. This usually
          clears up on its own — the worker refreshes the data a few times a
          day.
        </p>
        <button type="button" className={styles.button} onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
