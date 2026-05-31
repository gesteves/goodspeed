# Goodspeed monorepo

Two apps that share one data contract. **`api/`** pulls SFBOFS model output from
NOAA, extracts surface conditions for station **SFB1204** (SW of Alcatraz
Island), and publishes JSON feeds over HTTP. **`web/`** is an Astro dashboard
that renders those feeds. They are developed, tested, and deployed separately —
the only thing binding them is the JSON Schema in `schema/`.

Per-app detail lives in **`api/CLAUDE.md`** and **`web/CLAUDE.md`**; this file
covers only what spans both. Don't duplicate the per-app docs here.

## Layout

- `api/` — Python feed service (Fly Machine). See `api/CLAUDE.md`.
- `web/` — Astro + React dashboard (Netlify). See `web/CLAUDE.md`.
- `schema/` — the shared JSON Schema contracts (**source of truth**, below).
- `output/` — local dev feed dir the API writes and the web can read (gitignored;
  production API uses a Fly Volume at `/data`).
- `.github/workflows/ci.yml` — CI for the **API only** (the web deploys via
  Netlify, not GitHub Actions).

## The contract (`schema/`)

Two schemas, both authoritative:

- `sfbofs-sfb1204.schema.json` — the **point feed** (`latest.json`): a timeseries
  at the one station.
- `sfbofs-field.schema.json` — the **field feed** (`field-latest.json`): gridded
  currents + water temp over the Alcatraz corridor for the map.

Each side consumes the schemas differently:

| Schema | API uses it to… | Web uses it to… |
|---|---|---|
| both `schema/*.json` | **validate** output before publishing — `api/src/goodspeed/output.py` (`Draft202012Validator`, resolved via `GOODSPEED_SCHEMA_PATH`) | **mirror** as hand-written Zod in `web/src/lib/schema.ts` |
| drift guard | — | `web/src/lib/schema{,-field}.test.ts` fail `npm run check` if the Zod copy drifts from the JSON Schema |

So: the JSON Schema is edited first; the API validates against it and the web's
build fails until `schema.ts` is brought back in line.

## Data flow

```
NOAA THREDDS → api (extract + derive + validate)
            → writes latest.json + field-latest.json  (atomic; output/ or /data)
            → serves GET /latest.json, /field-latest.json, /healthz   (web.py, ~5-min cache)
web ← GOODSPEED_FEED_URL        → /latest.json        (src/lib/data-source/sfbofs.ts)
    ← GOODSPEED_FIELD_FEED_URL  → /field-latest.json  (src/lib/data-source/field.ts; optional — map hidden if unset)
```

`web/src/lib/data-source/raw.ts` adds a 5-min TTL cache, single-flight, timeout,
and last-good fallback in front of both fetches.

## Shared conventions (must stay in sync across both apps)

- **Units:** the feed carries **both** systems (`*_c`/`*_f`, `*_ms`/`*_kt`,
  `*_m`/`*_ft`). The API derives/converts (`output.py`); the web only **selects**
  a field, it never converts (`web/src/lib/units/units.ts`).
- **Time:** all feed timestamps are UTC (ISO-8601, `Z`). The web displays in
  `America/Los_Angeles` (`web/src/lib/constants.ts` `DISPLAY_TZ`).
- **Bearings:** **current bearing = direction the current flows TOWARD; wind
  bearing = direction the wind comes FROM** (`output.py`
  `current_bearing_deg`/`wind_bearing_deg`; schema clamps both to 0–360). Don't
  flip either convention.
- **Station:** fixed to `SFB1204` — `api/src/goodspeed/extract.py` `STATION_ID`,
  `web/src/lib/constants.ts` `STATION_ID`, and `const` in the schema.

## Deploys are independent

- **API** → GitHub Actions (`.github/workflows/ci.yml`): lint → test → deploy to
  Fly (`goodspeed-api`). Triggers on `api/**`, `schema/**`, or the workflow.
  `[skip deploy]` / `[no deploy]` in the commit message skips deploy.
- **Web** → Netlify, Git-triggered, `base = "web"`, runs `npm run check && npm
  run build`.

There is **no shared deploy.** A `schema/**` change ships the **API only** — the
web does not redeploy automatically, so you must deploy it too. Mitigating
nuance: the web parses feeds with Zod in non-strict mode, so the API **adding** a
field won't break a running web; **removing or renaming** a required field will
fail web parse at fetch time. Sequence accordingly.

## Cross-app change checklist

When you touch a shared surface, update the other side in the same change:

| If you… | API | Web |
|---|---|---|
| add a feed field | edit `schema/*.json` + emit it in `output.py`/`extract*.py` + test | add it to `schema.ts` (drift test will flag it) |
| rename/remove a feed field | same as above | update `schema.ts` **and** every reader; deploy web at/before the API |
| change a unit or conversion | edit the conversion in `output.py` (+ rounding) | usually nothing — web reads the value as-is |
| change bearing convention | don't — but if forced, edit math + schema desc + tests | flip every interpretation (`derive/currents.ts`, labels) |
| change the station | `STATION_ID`/coords in `extract.py` + schema `const` | `STATION_ID`, `STATION_URL`, bay-geometry constants |
| add data to the field feed | `extract_field.py` + `output.py` frame + field schema | `schema.ts` field schema + map rendering |

## Permission boundary

Same posture as the per-app files: editing/running locally is fine; **ask first**
before any `git` commit/push, dependency changes, or anything that deploys. Note
that editing `schema/` affects **both** apps and triggers the API deploy on push
to `main`.
