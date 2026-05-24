import { describe, expect, it, vi } from "vitest";

// Astro exposes `defineMiddleware` only via a virtual module that Vite
// resolves at build time. In a unit test it's a plain identity wrapper, so we
// stub it here.
vi.mock("astro:middleware", () => ({
  defineMiddleware: <T>(fn: T) => fn,
}));

import { onRequest } from "./middleware";
import { THEME_COOKIE, UNITS_COOKIE } from "@/lib/preferences";

interface FakeCookieJar {
  values: Record<string, string | undefined>;
}

function fakeContext(cookies: Record<string, string | undefined>) {
  const jar: FakeCookieJar = { values: cookies };
  return {
    cookies: {
      get(name: string) {
        const value = jar.values[name];
        return value === undefined ? undefined : { value };
      },
    },
    // Real Astro fills locals in; we mimic the same shape.
    locals: {} as { theme?: string; units?: string },
  };
}

const noop = async () => new Response(null);

describe("middleware onRequest", () => {
  it("defaults theme to 'system' and units to 'imperial' when cookies are absent", async () => {
    const ctx = fakeContext({});
    // The Astro middleware type is hard to satisfy with a fake. The runtime
    // only uses `cookies` and `locals`, so casting is safe here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await onRequest(ctx as any, noop);
    expect(ctx.locals).toEqual({ theme: "system", units: "imperial" });
  });

  it("reads valid cookie values onto Astro.locals", async () => {
    const ctx = fakeContext({
      [THEME_COOKIE]: "dark",
      [UNITS_COOKIE]: "metric",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await onRequest(ctx as any, noop);
    expect(ctx.locals).toEqual({ theme: "dark", units: "metric" });
  });

  it("falls back to defaults when cookies contain garbage", async () => {
    const ctx = fakeContext({
      [THEME_COOKIE]: "neon",
      [UNITS_COOKIE]: "furlongs",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await onRequest(ctx as any, noop);
    expect(ctx.locals).toEqual({ theme: "system", units: "imperial" });
  });

  it("calls next() exactly once and returns its response", async () => {
    const ctx = fakeContext({});
    const next = vi.fn(noop);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await onRequest(ctx as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res).toBeInstanceOf(Response);
  });
});
