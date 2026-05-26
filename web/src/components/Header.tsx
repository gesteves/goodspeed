import { STATION_URL } from "@/lib/constants";
import { nextCycleAt, type Staleness } from "@/lib/derive/staleness";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Feed } from "@/lib/schema";
import styles from "./Header.module.css";
import { ThemeToggle } from "./ThemeToggle";
import { UnitsToggle } from "./UnitsToggle";

export function Header({
  feed,
  staleness,
}: {
  feed: Feed;
  staleness: Staleness;
}) {
  const next = nextCycleAt();
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <p className={styles.subtitle}>
            <span>Modeled conditions</span>
            <span aria-hidden="true"> · </span>
            <a
              className={styles.subtitleLink}
              href={STATION_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {feed.station.name}
            </a>
          </p>
          <h1 className={styles.title}>Alcatraz Swim Conditions</h1>
        </div>
        <div className={styles.controls}>
          <UnitsToggle />
          <ThemeToggle />
        </div>
      </div>

      <div
        className={styles.status}
        title={
          staleness.status === "offline"
            ? "The forecast hasn't updated in over a day — data may be unreliable"
            : staleness.status === "stale"
              ? "The forecast data is older than usual"
              : undefined
        }
      >
        <span
          className={styles.dot}
          data-status={staleness.status}
          aria-hidden="true"
        />
        <span className={styles.statusText}>
          Forecast updated{" "}
          <span title={formatDateTime(feed.model.fetched_at)}>
            {formatRelative(feed.model.fetched_at)}
          </span>
        </span>
        <span className={styles.statusSep} aria-hidden="true">
          ·
        </span>
        <span className={styles.statusNext}>
          Next update{" "}
          <span title={formatDateTime(next)}>{formatRelative(next)}</span>
        </span>
      </div>
    </header>
  );
}

/**
 * Pre-data placeholder. Matches `Header`'s layout so the chrome (title,
 * toggles, status pill) is visible immediately on first paint with the same
 * dimensions as the real header.
 */
export function HeaderSkeleton() {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <p className={styles.subtitle}>
            <span>Modeled conditions</span>
            <span aria-hidden="true"> · </span>
            <a
              className={styles.subtitleLink}
              href={STATION_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              SW of Alcatraz Island
            </a>
          </p>
          <h1 className={styles.title}>Alcatraz Swim Conditions</h1>
        </div>
        <div className={styles.controls}>
          <UnitsToggle />
          <ThemeToggle />
        </div>
      </div>

      <div className={styles.status} aria-live="polite">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.statusText}>Loading conditions…</span>
      </div>
    </header>
  );
}
