import { describe, expect, it } from "vitest";
import { formatCountdown } from "./format";

describe("formatCountdown", () => {
  const secs = (n: number) => n * 1000;

  it("shows a day prefix with padded clock when >= 1 day out", () => {
    const ms = secs(2 * 86_400 + 3 * 3600 + 14 * 60 + 9);
    expect(formatCountdown(ms)).toBe("2d 03:14:09");
  });

  it("drops the day prefix and leaves hours unpadded when < 1 day", () => {
    const ms = secs(3 * 3600 + 14 * 60 + 9);
    expect(formatCountdown(ms)).toBe("3:14:09");
  });

  it("zero-pads minutes and seconds", () => {
    expect(formatCountdown(secs(5))).toBe("0:00:05");
    expect(formatCountdown(secs(9 * 60 + 5))).toBe("0:09:05");
  });

  it("clamps negative or zero to 0:00:00", () => {
    expect(formatCountdown(0)).toBe("0:00:00");
    expect(formatCountdown(-5000)).toBe("0:00:00");
  });
});
