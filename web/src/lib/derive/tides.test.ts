import { describe, expect, it } from "vitest";
import { makeSeries } from "@/test/fixtures";
import { findTideExtrema, nextTideEvent } from "./tides";

const START = new Date("2026-05-20T00:00:00Z");

// A clean sine with a 60-sample (6 h) period: peaks at 15, 75, 135, ...
// and troughs at 45, 105, 165, ...
const sineSeries = makeSeries(200, START, (i) => {
  const level = Math.sin((2 * Math.PI * i) / 60);
  return { water_level_m: level, water_level_ft: level * 3.28084 };
});

describe("findTideExtrema", () => {
  const events = findTideExtrema(sineSeries);

  it("finds the interior highs and lows", () => {
    expect(events.map((e) => e.index)).toEqual([15, 45, 75, 105, 135, 165]);
  });

  it("alternates high and low", () => {
    expect(events.map((e) => e.type)).toEqual([
      "high",
      "low",
      "high",
      "low",
      "high",
      "low",
    ]);
  });

  it("returns nothing for a flat series", () => {
    const flat = makeSeries(100, START, () => ({ water_level_m: 2 }));
    expect(findTideExtrema(flat)).toEqual([]);
  });
});

describe("nextTideEvent", () => {
  const events = findTideExtrema(sineSeries);

  it("returns the first event after a time", () => {
    const after = new Date(START.getTime() + 20 * 6 * 60_000); // index 20
    expect(nextTideEvent(events, after)?.index).toBe(45);
  });

  it("returns null when nothing follows", () => {
    expect(nextTideEvent(events, new Date("2030-01-01T00:00:00Z"))).toBeNull();
  });
});
