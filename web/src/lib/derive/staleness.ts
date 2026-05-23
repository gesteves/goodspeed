export type Freshness = "fresh" | "stale";

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

export function getStaleness(
  cycleIso: string,
  now: Date = new Date(),
): Staleness {
  const ageMs = now.getTime() - new Date(cycleIso).getTime();
  const ageHours = ageMs / 3_600_000;
  return {
    ageMs,
    ageHours,
    status: ageHours > STALE_AFTER_HOURS ? "stale" : "fresh",
  };
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
