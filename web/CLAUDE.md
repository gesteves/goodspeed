@AGENTS.md

# Goodspeed web dashboard

Next.js (App Router) dashboard that renders the swim-conditions feed published by
`../api/` for NOAA SFBOFS station SFB1204 (SW of Alcatraz Island — the Escape from
Alcatraz swim route, Alcatraz → Marina District).

## Commands

Use Node LTS (`nvm use` reads `.nvmrc`).

- `npm run dev` — dev server at http://localhost:3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest (unit tests for `src/lib/derive/` + the schema-sync check)

## Architecture

- `src/lib/schema.ts` — Zod schema for the feed, derived from the shared contract at
  `../schema/sfbofs-sfb1204.schema.json` (the source of truth). `schema.test.ts` fails
  if the two drift apart.
- `src/lib/data-source/` — the only place that knows where data comes from.
  `getDashboardData()` aggregates the SFBOFS feed (`sfbofs.ts`) and weather
  (`weather.ts`, a stub today). The future Google Weather/Air-Quality integration goes
  in `weather.ts` only.
- `src/lib/derive/` — pure functions over the timeseries (tide highs/lows, "now"
  point, current flood/ebb, staleness). Unit-tested.
- `src/app/page.tsx` — Server Component: fetches + derives, then hands serializable
  props to client components. The feed fetch is server-side (no CORS concern) and
  cached for 5 min (`next: { revalidate: 300 }`), matching the feed's own cache.
- `src/components/` — `Header`, `NowPanel` (current readings), `charts/` (visx
  forecast charts). Units (imperial/metric) and theme (system/light/dark) are
  cookie-backed client context so the server renders the right choice with no flash.

## Conventions

- Feed timestamps are UTC; display in `America/Los_Angeles`.
- The feed carries both unit systems — the units toggle selects a field, it does not
  convert.
- Current bearing = direction the current flows TOWARD. Wind bearing = direction the
  wind comes FROM. Keep them clearly labelled.
- "Just the data": charts and readings only, no swim verdict. Light factual
  annotations (tide highs/lows, flood/ebb, nowcast/forecast boundary) are fine.

## Config

- `GOODSPEED_FEED_URL` — feed location (http(s) URL, file: URL, or path). See
  `.env.example`.
- `GOOGLE_WEATHER_API_KEY` — future, server-only.

## Deploy

Hosted on Netlify with the standard Git-triggered build flow. Netlify runs
`npm run check && npm run build` on every push; `check` is
`lint && typecheck && test`, so any failure blocks the deploy. The repo's
`../.github/workflows/ci.yml` only covers the API (deploy to Fly.io).
