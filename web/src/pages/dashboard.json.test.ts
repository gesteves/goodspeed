import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-source", () => ({
  getDashboardData: vi.fn(async () => ({
    feed: { station: { id: "SFB1204" }, model: { cycle: 7 } },
    field: null,
    fieldStatus: "unconfigured" as const,
  })),
}));

describe("GET /dashboard.json", () => {
  it("returns the dashboard payload as JSON", async () => {
    const { GET } = await import("./dashboard.json");
    // The Astro APIRoute typing wants a full context; for this endpoint the
    // handler does not read any of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET({} as any);

    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({
      feed: { station: { id: "SFB1204" }, model: { cycle: 7 } },
      field: null,
      fieldStatus: "unconfigured",
    });
  });

  it("sets the Netlify edge cache headers expected by the docs", async () => {
    const { GET } = await import("./dashboard.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET({} as any);

    // Browser must revalidate every time (no local stale copy).
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    // Netlify edge: cache for 5 min (matches upstream cadence), allow 10 min
    // stale-while-revalidate so a flaky origin doesn't break the dashboard.
    expect(res.headers.get("Netlify-CDN-Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });
});
