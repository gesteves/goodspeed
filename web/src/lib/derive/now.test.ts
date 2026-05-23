import { describe, expect, it } from "vitest";
import { makeSeries } from "@/test/fixtures";
import { findNowIndex, levelTrend } from "./now";

const START = new Date("2026-05-20T00:00:00Z");

describe("findNowIndex", () => {
  it("picks the point closest to now", () => {
    const ts = makeSeries(60, START, () => ({}));
    // 67 min in -> closest 6-min sample is index 11 (66 min).
    const now = new Date(START.getTime() + 67 * 60_000);
    expect(findNowIndex(ts, now)).toBe(11);
  });

  it("clamps to the ends of the series", () => {
    const ts = makeSeries(10, START, () => ({}));
    expect(findNowIndex(ts, new Date("2020-01-01T00:00:00Z"))).toBe(0);
    expect(findNowIndex(ts, new Date("2030-01-01T00:00:00Z"))).toBe(9);
  });
});

describe("levelTrend", () => {
  it("detects rising and falling water", () => {
    const rising = makeSeries(40, START, (i) => ({ water_level_m: i * 0.1 }));
    const falling = makeSeries(40, START, (i) => ({ water_level_m: -i * 0.1 }));
    expect(levelTrend(rising, 20)).toBe("rising");
    expect(levelTrend(falling, 20)).toBe("falling");
  });

  it("reports steady water", () => {
    const flat = makeSeries(40, START, () => ({ water_level_m: 1 }));
    expect(levelTrend(flat, 20)).toBe("steady");
  });
});
