/**
 * Feed freshness classification. Drives the staleness banner in the header
 * and the disabled state of charts when the model has gone silent.
 */
export type Freshness = "fresh" | "stale" | "offline";

export interface Staleness {
  ageMs: number;
  ageHours: number;
  status: Freshness;
}

/**
 * NOAA publishes ~4 SFBOFS cycles/day (~6 h apart). Treat the feed as stale
 * once the model cycle is older than this -- a missed cycle plus buffer.
 */
const STALE_AFTER_HOURS = 9;

/**
 * If the model hasn't updated in this long, treat the feed as offline rather
 * than merely stale. Three to four cycles missed -- well past anything
 * explainable by a normal hiccup, and worth flagging distinctly in the UI.
 */
const OFFLINE_AFTER_HOURS = 24;

/**
 * Compute the age of the published model cycle and its freshness bucket.
 *
 * `cycleIso` is the `model.cycle` ISO string from the feed (the cycle hour,
 * not the fetch time). Age is measured against `now` -- defaulted but
 * overridable so server-rendered staleness can be computed at request time
 * and tests can pin the clock.
 */
export function getStaleness(
  cycleIso: string,
  now: Date = new Date(),
): Staleness {
  const ageMs = now.getTime() - new Date(cycleIso).getTime();
  const ageHours = ageMs / 3_600_000;
  let status: Freshness = "fresh";
  if (ageHours > OFFLINE_AFTER_HOURS) status = "offline";
  else if (ageHours > STALE_AFTER_HOURS) status = "stale";
  return { ageMs, ageHours, status };
}

/** NOAA publishes SFBOFS cycles at these UTC hours. */
const CYCLE_HOURS_UTC = [3, 9, 15, 21];

/** The next NOAA SFBOFS cycle time strictly after `now`. */
export function nextCycleAt(now: Date = new Date()): Date {
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const hour of CYCLE_HOURS_UTC) {
      const candidate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + dayOffset,
          hour,
        ),
      );
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return new Date(now.getTime() + 6 * 3_600_000);
}
