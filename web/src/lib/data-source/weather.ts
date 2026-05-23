/**
 * Weather + air-quality source.
 *
 * Stub for now -- the dashboard renders from the SFBOFS feed alone. When the
 * Google Weather & Air-Quality integration lands, it goes here and here only:
 * read `process.env.GOOGLE_WEATHER_API_KEY` (server-only), fetch, and return a
 * typed payload. `getDashboardData()` already threads the result through, and
 * `DashboardData.weather` is already optional, so nothing else needs to change.
 * On failure, return null so the dashboard degrades gracefully.
 */

export type Weather = null;

export async function getWeather(): Promise<Weather> {
  return null;
}
