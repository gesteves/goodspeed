/** Shared constants and geometry for the Goodspeed dashboard. */

export const STATION_ID = "SFB1204";

/** NOAA station page for SFB1204 (SW of Alcatraz Island). */
export const STATION_URL =
  "https://tidesandcurrents.noaa.gov/ofs/ofs_station.html?stname=SW%20of%20AI&ofs=sfb&stnid=SFB1204&subdomain=en";

/** Timezone for displaying the (UTC) feed timestamps. */
export const DISPLAY_TZ = "America/Los_Angeles";

/**
 * Approximate flood-current set for the Central Bay near SFB1204. Flood flows
 * in from the ocean (roughly ESE, into the bay); ebb flows out toward the
 * Golden Gate. Used only to label current as flood/ebb -- an approximation
 * from bay geometry, not a NOAA current prediction.
 */
export const FLOOD_BEARING_DEG = 110;

/** Below this current speed (knots) the current is treated as slack. */
export const SLACK_CURRENT_KT = 0.15;
