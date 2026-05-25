import { describe, expect, it } from "vitest";
import { getStaleness, nextCycleAt } from "./staleness";

describe("getStaleness", () => {
  const now = new Date("2026-05-20T12:00:00Z");

  it("treats a recent cycle as fresh", () => {
    const s = getStaleness("2026-05-20T09:00:00Z", now); // 3 h old
    expect(s.status).toBe("fresh");
    expect(s.ageHours).toBeCloseTo(3);
  });

  it("treats an old cycle as stale", () => {
    const s = getStaleness("2026-05-20T00:00:00Z", now); // 12 h old
    expect(s.status).toBe("stale");
  });

  it("treats a very old cycle as offline", () => {
    const s = getStaleness("2026-05-19T09:00:00Z", now); // 27 h old
    expect(s.status).toBe("offline");
  });
});

describe("nextCycleAt", () => {
  it("returns the next cycle hour after now", () => {
    expect(nextCycleAt(new Date("2026-05-20T12:00:00Z")).toISOString()).toBe(
      "2026-05-20T15:00:00.000Z",
    );
  });

  it("rolls to the next day after the last cycle", () => {
    expect(nextCycleAt(new Date("2026-05-20T22:00:00Z")).toISOString()).toBe(
      "2026-05-21T03:00:00.000Z",
    );
  });
});
