import { describe, expect, it } from "vitest";
import { FLOOD_BEARING_DEG } from "@/lib/constants";
import { makePoint } from "@/test/fixtures";
import { classifyCurrent } from "./currents";

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
