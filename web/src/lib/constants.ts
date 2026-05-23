/** Shared constants and geometry for the Goodspeed dashboard. */

export const STATION_ID = "SFB1204";

/** NOAA station page for SFB1204 (SW of Alcatraz Island). */
export const STATION_URL =
  "https://tidesandcurrents.noaa.gov/ofs/ofs_station.html?stname=SW%20of%20AI&ofs=sfb&stnid=SFB1204&subdomain=en";

/** Timezone for displaying the (UTC) feed timestamps. */
export const DISPLAY_TZ = "America/Los_Angeles";

type LatLon = { lat: number; lon: number };

/** Endpoints of the Escape from Alcatraz swim leg. */
export const ALCATRAZ: LatLon = { lat: 37.8267, lon: -122.423 };
export const MARINA: LatLon = { lat: 37.8063, lon: -122.442 };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle initial bearing from `from` to `to`, in degrees (0-360, 0 = N). */
export function initialBearing(from: LatLon, to: LatLon): number {
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Nominal heading a swimmer holds on the Alcatraz -> Marina leg (~214deg, SW).
 * The real crossing isn't a straight line -- swimmers ferry-glide with the
 * current -- but a single heading is enough to relate current direction to the
 * route.
 */
export const SWIM_HEADING_DEG = initialBearing(ALCATRAZ, MARINA);

/**
 * Approximate flood-current set for the Central Bay near SFB1204. Flood flows
 * in from the ocean (roughly ESE, into the bay); ebb flows out toward the
 * Golden Gate. Used only to label current as flood/ebb -- an approximation
 * from bay geometry, not a NOAA current prediction.
 */
export const FLOOD_BEARING_DEG = 110;

/** Below this current speed (knots) the current is treated as slack. */
export const SLACK_CURRENT_KT = 0.15;
