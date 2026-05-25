import { describe, expect, it } from "vitest";
import {
  computeGridExtent,
  VIEW_HEIGHT_MILES,
  VIEW_WIDTH_MILES,
} from "./extent";

// Field center used by the dashboard (centered SW of Alcatraz). Hardcoded here
// rather than imported so that a careless edit to the API's center constant
// shows up as a test diff instead of silently shifting the assertions.
const CENTER = { lat: 37.81712739692702, lon: -122.435219371718 };

const EARTH_RADIUS_MI = 3958.7613;
const MI_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_MI) / 180;

describe("computeGridExtent", () => {
  it("centers the extent on the requested center point", () => {
    const e = computeGridExtent(CENTER);
    expect((e.latMin + e.latMax) / 2).toBeCloseTo(CENTER.lat, 12);
    expect((e.lonMin + e.lonMax) / 2).toBeCloseTo(CENTER.lon, 12);
  });

  it("uses the configured view height in miles for the lat span", () => {
    const e = computeGridExtent(CENTER);
    const latSpanDeg = e.latMax - e.latMin;
    const latSpanMi = latSpanDeg * MI_PER_DEG_LAT;
    expect(latSpanMi).toBeCloseTo(VIEW_HEIGHT_MILES, 6);
  });

  it("scales lon span by cos(lat) so the view width is true miles", () => {
    const e = computeGridExtent(CENTER);
    const miPerDegLon = MI_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180);
    const lonSpanMi = (e.lonMax - e.lonMin) * miPerDegLon;
    expect(lonSpanMi).toBeCloseTo(VIEW_WIDTH_MILES, 6);
  });

  it("reports the aspect ratio as width/height in miles", () => {
    const e = computeGridExtent(CENTER);
    expect(e.aspectRatio).toBeCloseTo(VIEW_WIDTH_MILES / VIEW_HEIGHT_MILES, 12);
  });

  it("compresses the lon-degree span at the equator vs higher latitudes", () => {
    // To cover the same number of miles, the lon-degree span at higher
    // latitudes must widen because miles-per-degree-lon shrinks with cos(lat).
    const here = computeGridExtent(CENTER);
    const equator = computeGridExtent({ lat: 0, lon: CENTER.lon });
    expect(equator.lonMax - equator.lonMin).toBeLessThan(
      here.lonMax - here.lonMin,
    );
  });
});
