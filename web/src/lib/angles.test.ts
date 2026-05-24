import { describe, expect, it } from "vitest";
import { angularDelta, compass16, compass8Word } from "./angles";

describe("angularDelta", () => {
  it("is zero for equal bearings", () => {
    expect(angularDelta(90, 90)).toBe(0);
  });

  it("takes the short way around the compass", () => {
    expect(angularDelta(350, 10)).toBe(20);
    expect(angularDelta(10, 350)).toBe(20);
  });

  it("caps at 180", () => {
    expect(angularDelta(0, 180)).toBe(180);
    expect(angularDelta(0, 270)).toBe(90);
  });
});

describe("compass16", () => {
  it("maps cardinal bearings", () => {
    expect(compass16(0)).toBe("N");
    expect(compass16(90)).toBe("E");
    expect(compass16(180)).toBe("S");
    expect(compass16(270)).toBe("W");
  });

  it("rounds to the nearest point and wraps", () => {
    expect(compass16(45)).toBe("NE");
    expect(compass16(359)).toBe("N");
  });
});

describe("compass8Word", () => {
  it("maps cardinal bearings to lowercase words", () => {
    expect(compass8Word(0)).toBe("north");
    expect(compass8Word(90)).toBe("east");
    expect(compass8Word(180)).toBe("south");
    expect(compass8Word(270)).toBe("west");
  });

  it("rounds to the nearest 8-point and spells intercardinals", () => {
    expect(compass8Word(45)).toBe("northeast");
    expect(compass8Word(257)).toBe("west");
    expect(compass8Word(69)).toBe("east");
  });
});
