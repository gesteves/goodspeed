# Goodspeed web dashboard

Astro 6 + a single React 19 island. Renders the swim-conditions feed published
by `../api/` for NOAA SFBOFS station SFB1204 (SW of Alcatraz Island). The
Escape from Alcatraz start point isn't fixed — swimmers are dropped from a boat
at a spot chosen on race day — so the dashboard shows conditions in the central
bay near Alcatraz, not annotations tied to a specific route.

**Stack:** Astro 6 (`output: "server"` + `@astrojs/netlify`, but pages opt into
`prerender = true`), React 19 island, visx charts, Mapbox GL, Zod, Vitest,
ESLint, TypeScript. Node LTS — run `nvm use` (reads `.nvmrc` = `lts/*`).

## Setup

```sh
npm install        # needs FONTAWESOME_NPM_AUTH_TOKEN in the env (FA Pro registry; else 401)
cp .env.example .env.local   # then fill in GOODSPEED_FEED_URL etc.
```

`.npmrc` sets `legacy-peer-deps=true` (required: `@visx/*` still declares a
React 16–18 peer range and we're on React 19). Leave it.

## Commands

Prefer file-scoped commands for fast feedback; use the full suite before pushing.

```sh
netlify dev          # local dev server at http://localhost:8888 (see note below)
npm run check        # lint + typecheck + test — the full gate Netlify runs
npm run build        # production build (writes dist/ + .netlify/)
npm run preview      # serve the production build locally

# File-scoped (fast):
npx vitest run src/lib/derive/tides.test.ts   # one test file
npx eslint src/components/Dashboard.tsx        # lint one file
npm run check:schema                           # just the point-feed contract drift test (field feed: schema-field.test.ts)

npm run map-image    # tsx scripts/map-image.ts — write bay-map stills locally
```

`npm run typecheck` is `astro check` (Astro language server + `tsc --noEmit`).
`npm run lint` is bare `eslint`. `npm test` is `vitest run`.

**Run the dev server with `netlify dev`, not bare `npm run dev`.** The
`@astrojs/netlify` adapter expects the Netlify CLI's local runtime; starting
`astro dev` directly throws an unhandled rejection about the Edge Functions dev
server and never comes up. `netlify dev` also serves the `netlify/functions/*`
image endpoints locally. Needs the Netlify CLI (`npm i -g netlify-cli`).

## Code style & conventions

- **No `next/*` imports.** This was Next.js once; the migration is complete. A
  `next/*` import is a bug, not a fallback.
- **No `"use client"` directives.** Astro hydrates the island via `client:*`
  directives on the island root, not React Server Component boundaries.
- Path alias `@/` → `src/` (set in `astro.config.mjs` and `vitest.config.ts`).
- **Env vars:** import from `astro:env/server` or `astro:env/client` — never
  `process.env`. Schema lives in `astro.config.mjs` under `env.schema`;
  required-but-missing server vars throw at startup. `src/lib/env.ts` is a thin
  re-export of the validated values.
- Feed timestamps are UTC; **display in `America/Los_Angeles`**.
- The feed carries **both** unit systems — the units toggle selects which field
  to read, it does **not** convert. See `src/lib/units/units.ts`.
- **Current bearing = direction the current flows TOWARD. Wind bearing =
  direction the wind comes FROM.** Keep them clearly labelled.
- "Just the data": charts and readings only, no swim verdict. Light factual
  annotations (tide highs/lows, flood/ebb, nowcast/forecast boundary) are fine.

## Architecture

Pages ship a **prerendered static HTML shell** with skeletons; the `<Dashboard
client:load>` island fetches `/dashboard.json` on hydration to fill them. There
is **no middleware** — prefs are read client-side (see below).

- `src/pages/index.astro` — `prerender = true`. Mounts the island; passes no
  initial data, so first paint is a skeleton and TTFB is decoupled from the
  upstream NOAA fetch.
- `src/pages/dashboard.json.ts` — the one SSR route. Calls `getDashboardData()`;
  the island polls it every 60s (also on `visibilitychange` / `online`). NOT
  under `/api/` on purpose: the `/api/event` rewrite in `netlify.toml` proxies
  that namespace to Plausible. Sets `Netlify-CDN-Cache-Control` so the edge
  caches it ~5 min.
- `src/components/Dashboard.tsx` — the single React island. Owns the refresh
  loop, re-derives on a local clock tick (so "now" follows the user's clock),
  and skips `setState` when the model cycle is unchanged so visx charts don't
  re-render on no-op refreshes. Theme/units survive refreshes because the whole
  interactive tree lives here.
- `src/layouts/Layout.astro` — HTML shell. Applies the `gs-theme` cookie
  flash-free via an inline `is:inline` script (pages are prerendered, so a
  server can't do it). Preloads `/dashboard.json`, injects Plausible.
- `src/lib/data-source/` — the only place that knows where data comes from.
  `getDashboardData()` aggregates the point feed (`sfbofs.ts`) and gridded field
  feed (`field.ts`). `raw.ts` has a 5-min TTL cache + single-flight guard, a
  per-fetch timeout, and falls back to the last good response on upstream
  failure.
- `src/lib/schema.ts` — Zod schemas for **both** feeds, hand-mirrored from the
  shared contracts at `../schema/sfbofs-sfb1204.schema.json` (point feed) and
  `../schema/sfbofs-field.schema.json` (gridded field feed) — the JSON Schemas
  are the **source of truth**. `schema.test.ts` and `schema-field.test.ts` fail
  the build if the Zod copy drifts from either contract.
- `src/lib/derive/` — pure functions over the timeseries (tide extrema, "now"
  point, flood/ebb, staleness). Unit-tested.
- `src/components/` — `Header`, `now/`, `charts/` (visx), `map/` (lazy Mapbox
  via `React.lazy`). Theme (`gs-theme`) and units (`gs-units`) are cookie-backed
  client context in `components/providers/`.
- `netlify/functions/{og,map}.mts` — Node Functions for share/still images at
  `/images/og.png` and `/images/map/*.png`. Must be `.mts` (ESM) — `netlify dev`
  loads `.tsx` as CJS, which breaks `@vercel/og`. `map.mts` and the
  `scripts/map-image.ts` CLI both render via `src/lib/map-image/render.ts`, so
  they can't drift. **The sRGB color stops and Mapbox-static projection math are
  intentionally duplicated in `og.mts` / `render.ts`** (satori/resvg can't run
  the live map's OKLCH path); everything else imports from shared modules.

## Testing

Vitest, `environment: "node"`, files are `src/**/*.test.ts`. Derivations,
schema, colors, angles, and the units locale default all have unit tests.
Shared fixtures in `src/test/fixtures.ts`. Add a test alongside the module
(`foo.ts` → `foo.test.ts`). Run one file with `npx vitest run <path>`.

## Safety & permission boundaries

- **Autonomous:** read files, `npm run lint` / `typecheck` / `test`, file-scoped
  vitest/eslint, edits + the dev server.
- **Ask first:** `npm install` / dependency changes (needs the FA token and can
  touch the lockfile), any `git` commit/push, deleting files, or anything that
  deploys. Don't commit `.env.local`.

## Config

Typed in `astro.config.mjs` (`env.schema`); see `.env.example`.

- `GOODSPEED_FEED_URL` — server, **required**. Point feed (http(s)/`file:`/path).
- `GOODSPEED_FIELD_FEED_URL` — server, optional. Gridded field feed for the map.
- `PUBLIC_MAPBOX_TOKEN` — client, optional. The bay map is hidden if absent.
- `PUBLIC_PLAUSIBLE_SCRIPT_ID` — client, optional. Analytics off if unset.

Not in the Astro schema: **`MAPBOX_STATIC_TOKEN`** is a raw `process.env` var
(read directly, not via `astro:env`) that `netlify/functions/og.mts` falls back
to for the share-image map when `PUBLIC_MAPBOX_TOKEN` is unset; without any
Mapbox token the OG image's map is blank. (The `.env.example` comment calling
`og` an "edge function" is stale — it's a Node Function.)

Secrets live in `.env.local` (local) and Netlify env vars (deploy) — never in
this repo.

## Deploy

Netlify, Git-triggered, `base = "web"`. Every push runs
`npm run check && npm run build`; `check` is `lint && typecheck && test`, so any
failure blocks the deploy. `@astrojs/netlify` writes the function bundle +
redirects into `.netlify/` automatically. `netlify.toml` proxies the Plausible
script and `/api/event` through this domain so ad blockers don't drop them. The
web app is **not** in `../.github/workflows/ci.yml` — that workflow is API-only.
