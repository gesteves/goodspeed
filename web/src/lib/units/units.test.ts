import { afterEach, describe, expect, it, vi } from "vitest";
import { localeDefaultUnits } from "./units";

/** Stub the browser globals the helper reads (node test environment). */
function browser(language: string, search = "") {
  vi.stubGlobal("navigator", { language });
  vi.stubGlobal("window", { location: { search } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localeDefaultUnits", () => {
  it("maps US English to imperial", () => {
    browser("en-US");
    expect(localeDefaultUnits()).toBe("imperial");
  });

  it("maps bare `en` to imperial via maximize (-> US)", () => {
    browser("en");
    expect(localeDefaultUnits()).toBe("imperial");
  });

  it("maps Liberia to imperial", () => {
    browser("en-LR");
    expect(localeDefaultUnits()).toBe("imperial");
  });

  it("maps British English to metric", () => {
    browser("en-GB");
    expect(localeDefaultUnits()).toBe("metric");
  });

  it("maps a bare non-English tag to metric via maximize (fr -> FR)", () => {
    browser("fr");
    expect(localeDefaultUnits()).toBe("metric");
  });

  it("honors the ?locale= override ahead of navigator.language", () => {
    browser("en-US", "?locale=de-DE");
    expect(localeDefaultUnits()).toBe("metric");
  });

  it("falls back to the app default on an unparseable tag", () => {
    browser("not a locale!!");
    expect(localeDefaultUnits()).toBe("imperial");
  });

  it("falls back to the app default when navigator is absent", () => {
    // No stubs -> typeof navigator === "undefined" in the node env.
    expect(localeDefaultUnits()).toBe("imperial");
  });
});
