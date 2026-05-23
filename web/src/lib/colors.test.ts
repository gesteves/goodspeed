import { describe, expect, it } from "vitest";
import {
  TEMP_DOMAIN_C,
  tempColor,
  tempColorStops,
  tempDomainLabels,
} from "./colors";

describe("tempColor", () => {
  it("returns a CSS oklch string", () => {
    expect(tempColor(14)).toMatch(/^oklch\(\d+\.\d+ \d+\.\d+ \d+\.\d+\)$/);
  });

  it("clamps below the domain to the cool stop", () => {
    expect(tempColor(0)).toBe(tempColor(TEMP_DOMAIN_C[0]));
  });

  it("clamps above the domain to the warm stop", () => {
    expect(tempColor(100)).toBe(tempColor(TEMP_DOMAIN_C[1]));
  });

  it("produces different colors at domain ends", () => {
    expect(tempColor(TEMP_DOMAIN_C[0])).not.toBe(tempColor(TEMP_DOMAIN_C[1]));
  });
});

describe("tempDomainLabels", () => {
  it("formats Fahrenheit for imperial", () => {
    const { min, max } = tempDomainLabels("imperial");
    expect(min).toBe("55°F");
    expect(max).toBe("65°F");
  });

  it("formats Celsius for metric", () => {
    const { min, max } = tempDomainLabels("metric");
    expect(min).toBe("13°C"); // 12.778 rounds to 13
    expect(max).toBe("18°C"); // 18.333 rounds to 18
  });
});

describe("tempColorStops", () => {
  it("produces the requested number of stops", () => {
    expect(tempColorStops(5)).toHaveLength(5);
  });
});
