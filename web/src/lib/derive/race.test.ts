import { describe, expect, it } from "vitest";
import { isInFeedRange, parseRaceStart } from "./race";

describe("parseRaceStart", () => {
  it("reads a plain wall-clock string as America/Los_Angeles", () => {
    // 2026-06-08 is PDT (UTC-7), so 07:30 local == 14:30 UTC.
    const d = parseRaceStart("2026-06-08T07:30");
    expect(d?.toISOString()).toBe("2026-06-08T14:30:00.000Z");
  });

  it("handles the standard-time offset (PST, UTC-8)", () => {
    const d = parseRaceStart("2026-01-10T07:30");
    expect(d?.toISOString()).toBe("2026-01-10T15:30:00.000Z");
  });

  it("returns null for empty or undefined input", () => {
    expect(parseRaceStart(undefined)).toBeNull();
    expect(parseRaceStart("")).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(parseRaceStart("not a date")).toBeNull();
  });
});

describe("isInFeedRange", () => {
  const times = [
    "2026-06-08T00:00:00Z",
    "2026-06-08T06:00:00Z",
    "2026-06-08T12:00:00Z",
  ];

  it("is true inside the range (inclusive of endpoints)", () => {
    expect(isInFeedRange(times, new Date("2026-06-08T03:00:00Z"))).toBe(true);
    expect(isInFeedRange(times, new Date("2026-06-08T00:00:00Z"))).toBe(true);
    expect(isInFeedRange(times, new Date("2026-06-08T12:00:00Z"))).toBe(true);
  });

  it("is false before the first or after the last timestamp", () => {
    expect(isInFeedRange(times, new Date("2026-06-07T23:59:59Z"))).toBe(false);
    expect(isInFeedRange(times, new Date("2026-06-08T12:00:01Z"))).toBe(false);
  });

  it("is false for an empty timeseries", () => {
    expect(isInFeedRange([], new Date("2026-06-08T06:00:00Z"))).toBe(false);
  });
});
