import { describe, expect, it } from "vitest";
import { formatLongDateTime } from "./format";

describe("formatLongDateTime", () => {
  it("renders a friendly date and time without weekday or timezone", () => {
    // 2026-06-07T14:00Z == 7:00 AM PDT (UTC-7) in America/Los_Angeles.
    expect(formatLongDateTime("2026-06-07T14:00:00Z")).toBe(
      "June 7th, 2026, 7:00 AM",
    );
  });

  it("uses the right ordinal suffix", () => {
    expect(formatLongDateTime("2026-06-01T19:30:00Z")).toBe(
      "June 1st, 2026, 12:30 PM",
    );
  });

  it("returns an em-dash for an invalid value", () => {
    expect(formatLongDateTime("not a date")).toBe("—");
  });
});
