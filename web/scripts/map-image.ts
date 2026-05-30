/**
 * Local CLI: render a high-resolution still of the bay map at a given
 * date/time, for embedding in a blog post (e.g. the forecast conditions at the
 * race start).
 *
 * It is the OG share renderer (`netlify/functions/og.mts`), generalized:
 *   - an arbitrary timestamp (parsed from natural language) instead of "now",
 *   - the dashboard's true view extent (3.0 mi x 1.77 mi) instead of OG's
 *     wider crop,
 *   - 2x the resolution -- the maximum Mapbox Static Images allows (1280 logical
 *     @2x = 2560 px wide),
 *   - plus the three overlays OG omits: the water-temperature legend, the swim
 *     start ring, and the swim finish marker (both with labels).
 *
 * Local-only tooling, run via tsx -- not part of the Astro app, so it reads
 * `process.env` directly (loading `web/.env.local` itself) rather than going
 * through `astro:env`. It reuses the same shared geometry / schema / frame
 * picker the live map and OG image use, so it can't drift from them.
 *
 *   npm run map-image -- "8:30am June 8 2026"
 *   npm run map-image                      # prompts; blank = current conditions
 *   npm run map-image -- --theme dark --units metric --out start.png "race start"
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@vercel/og";
import * as chrono from "chrono-node";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DISPLAY_TZ } from "../src/lib/constants";
import { nearestTimeIndex } from "../src/lib/derive/now";
import { buildMapImage, DEFAULT_ARROW_BOOST } from "../src/lib/map-image/render";
import { FieldFeedSchema } from "../src/lib/schema";
import type { UnitSystem } from "../src/lib/units/units";

// ---- Arg parsing -------------------------------------------------------------
interface Args {
  when: string; // free-text date/time ("" => prompt or now)
  out: string | null;
  theme: "light" | "dark";
  units: UnitSystem;
  feed: string | null;
  token: string | null;
  arrowBoost: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    when: "",
    out: null,
    theme: "light",
    units: "imperial",
    feed: null,
    token: null,
    arrowBoost: DEFAULT_ARROW_BOOST,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i] ?? null;
    else if (a === "--theme") args.theme = argv[++i] === "dark" ? "dark" : "light";
    else if (a === "--units") args.units = argv[++i] === "metric" ? "metric" : "imperial";
    else if (a === "--feed") args.feed = argv[++i] ?? null;
    else if (a === "--token") args.token = argv[++i] ?? null;
    else if (a === "--arrow-scale") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error("--arrow-scale must be a positive number");
      args.arrowBoost = v;
    } else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  args.when = positional.join(" ").trim();
  return args;
}

// ---- .env.local loader (dependency-free) ------------------------------------
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(SCRIPT_DIR, "..");
// Default output folder (gitignored). Overridden by --out.
const OUTPUT_DIR = resolve(WEB_DIR, "map-exports");

async function loadEnvLocal(): Promise<void> {
  let text: string;
  try {
    text = await readFile(resolve(WEB_DIR, ".env.local"), "utf8");
  } catch {
    return; // no .env.local -- rely on the ambient environment
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ---- Natural-language date -> UTC instant -----------------------------------
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse free-text `input` to a UTC instant. A bare wall-clock time ("8:30am
 * June 8") is interpreted in America/Los_Angeles (the race tz), DST-correct and
 * independent of the machine's timezone. An explicit offset in the text is
 * honored as-is. Empty input => now.
 */
function parseWhen(input: string): Date {
  if (!input) return new Date();
  const results = chrono.parse(input, new Date(), { forwardDate: true });
  const r = results[0];
  if (!r) throw new Error(`Could not understand date/time: "${input}"`);
  // Explicit timezone in the text -> chrono already resolved the absolute instant.
  if (r.start.isCertain("timezoneOffset")) return r.date();
  // Otherwise treat the parsed wall-clock components as Pacific time.
  const c = r.start;
  const y = c.get("year");
  const mo = c.get("month");
  const d = c.get("day");
  if (y == null || mo == null || d == null) {
    throw new Error(`Could not understand date/time: "${input}"`);
  }
  const hh = c.get("hour") ?? 12;
  const mm = c.get("minute") ?? 0;
  const wall = `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00`;
  return fromZonedTime(wall, DISPLAY_TZ);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvLocal();

  const feedUrl = args.feed ?? process.env.GOODSPEED_FIELD_FEED_URL;
  const token = args.token ?? process.env.MAPBOX_STATIC_TOKEN;
  if (!feedUrl) {
    throw new Error(
      "GOODSPEED_FIELD_FEED_URL is not set (web/.env.local or --feed). " +
        "Point it at the deployed /field-latest.json or a local field feed file.",
    );
  }
  if (!token) {
    throw new Error(
      "MAPBOX_STATIC_TOKEN is not set (web/.env.local or --token). " +
        "Use an unrestricted Mapbox token (the static API sends no Referer).",
    );
  }

  // Prompt for the time only when none was passed on the command line.
  let when = args.when;
  if (!when) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    when = (await rl.question("Date/time (blank = current conditions): ")).trim();
    rl.close();
  }
  const target = parseWhen(when);

  // Fetch (http[s]) or read (file path) the field feed.
  let raw: unknown;
  if (/^https?:\/\//.test(feedUrl)) {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Field feed fetch failed: HTTP ${res.status}`);
    raw = await res.json();
  } else {
    const path = feedUrl.startsWith("file://") ? fileURLToPath(feedUrl) : resolve(WEB_DIR, feedUrl);
    raw = JSON.parse(await readFile(path, "utf8"));
  }
  const feed = FieldFeedSchema.parse(raw);

  // Pick the frame closest to the target instant.
  const frameIdx = Math.min(nearestTimeIndex(feed.t, target), feed.frames.length - 1);
  const matchedIso = feed.t[frameIdx];
  const fmt = "EEE MMM d, yyyy h:mm a zzz";
  console.log(`Requested:  ${formatInTimeZone(target, DISPLAY_TZ, fmt)}`);
  console.log(
    `Using frame: ${formatInTimeZone(new Date(matchedIso), DISPLAY_TZ, fmt)} (${feed.source[frameIdx]})`,
  );
  const spanStart = new Date(feed.t[0]).getTime();
  const spanEnd = new Date(feed.t[feed.t.length - 1]).getTime();
  if (target.getTime() < spanStart || target.getTime() > spanEnd) {
    console.warn(
      "⚠ Requested time is outside the feed's coverage; clamped to the nearest available frame.",
    );
  }

  // Render the still (geometry, arrows, ring, finish marker, labels, legend).
  const { tree, width, height } = buildMapImage(feed, frameIdx, {
    token,
    theme: args.theme,
    units: args.units,
    arrowBoost: args.arrowBoost,
  });

  const png = Buffer.from(await new ImageResponse(tree, { width, height }).arrayBuffer());
  const outPath = args.out
    ? resolve(args.out)
    : resolve(OUTPUT_DIR, `map-${formatInTimeZone(target, DISPLAY_TZ, "yyyyMMdd-HHmm")}-PT.png`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, png);
  console.log(`Wrote ${outPath} (${width}x${height})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
