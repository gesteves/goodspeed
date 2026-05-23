import { describe, expect, it } from "vitest";
import { FLOOD_BEARING_DEG, SWIM_HEADING_DEG } from "@/lib/constants";
import { makePoint } from "@/test/fixtures";
import { classifyCurrent, swimRelative } from "./currents";

describe("classifyCurrent", () => {
  it("calls a near-zero current slack", () => {
    expect(
      classifyCurrent(makePoint({ current_speed_kt: 0.05 })),
    ).toBe("slack");
  });

  it("classifies flow toward the bay as flood", () => {
    expect(
      classifyCurrent(
        makePoint({
          current_speed_kt: 1.5,
          current_bearing_deg: FLOOD_BEARING_DEG,
        }),
      ),
    ).toBe("flood");
  });

  it("classifies flow toward the Gate as ebb", () => {
    expect(
      classifyCurrent(
        makePoint({
          current_speed_kt: 1.5,
          current_bearing_deg: (FLOOD_BEARING_DEG + 180) % 360,
        }),
      ),
    ).toBe("ebb");
  });
});

describe("swimRelative", () => {
  it("flags a current along the swim heading as with the route", () => {
    expect(swimRelative(SWIM_HEADING_DEG).relation).toBe("with");
  });

  it("flags an opposing current as against the route", () => {
    expect(swimRelative((SWIM_HEADING_DEG + 180) % 360).relation).toBe(
      "against",
    );
  });

  it("flags a perpendicular current as across the route", () => {
    expect(swimRelative((SWIM_HEADING_DEG + 90) % 360).relation).toBe(
      "across",
    );
  });
});
