# Goodspeed web dashboard

Astro 6 (SSR via `@astrojs/netlify`) + a React 19 island. Renders the
swim-conditions feed published by `../api/` for NOAA SFBOFS station SFB1204
(SW of Alcatraz Island — the Escape from Alcatraz swim route, Alcatraz →
Marina District).

This project used to be Next.js 16; the migration is complete and there is no
`next/*` import anywhere. If you find one, that's a bug, not a fallback. The
React components do not need `"use client"` directives — Astro hydrates them
based on `client:*` directives on the island root.

## Commands

Use Node LTS (`nvm use` reads `.nvmrc`).

- `npm run dev` — dev server at http://localhost:4321
- `npm run build` — production build (writes `dist/` + `.netlify/`)
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint
- `npm run typecheck` — `astro check` (Astro language server + `tsc --noEmit`)
- `npm test` — Vitest

`legacy-peer-deps=true` in `.npmrc` is required: `@visx/*` still declares a
React 16/17/18 peer range and we're on React 19.

## Architecture

- `src/lib/schema.ts` — Zod schema for the feed, derived from the shared contract at
  `../schema/sfbofs-sfb1204.schema.json` (the source of truth). `schema.test.ts` fails
  if the two drift apart.
- `src/lib/data-source/` — the only place that knows where data comes from.
  `getDashboardData()` aggregates the SFBOFS point feed (`sfbofs.ts`) and the
  gridded field feed (`field.ts`). `raw.ts` has an in-memory 5-min TTL cache +
  single-flight guard for the http(s) fetch path, a 10s `AbortSignal` timeout,
  and falls back to the last successful response on upstream failure.
- `src/lib/derive/` — pure functions over the timeseries (tide highs/lows, "now"
  point, current flood/ebb, staleness). Unit-tested.
- `src/middleware.ts` — reads the `gs-theme` / `gs-units` cookies into
  `Astro.locals` once per request so the layout and pages share the same values.
- `src/layouts/Layout.astro` — HTML shell. Sets `<html data-theme>` flash-free
  from `Astro.props.initialTheme`, imports Geist via
  `@fontsource-variable/geist{,-mono}`, injects Plausible analytics in `<head>`
  (proxied through Netlify rewrites).
- `src/pages/index.astro` — Astro frontmatter fetches `getDashboardData()` for
  the first paint and mounts a single `<Dashboard client:load>` React island
  with the initial data + theme/units pulled from `Astro.locals`.
- `src/pages/dashboard.json.ts` — SSR JSON endpoint the island polls every 60s
  (also on `visibilitychange` / `online`) to refresh state without a page
  navigation. It is intentionally NOT under `/api/`: the `/api/event`
  rewrite in `netlify.toml` proxies that namespace to Plausible. Sets
  `Netlify-CDN-Cache-Control: s-maxage=300, stale-while-revalidate=600` so
  Netlify's edge caches the response between origin hits.
- `src/components/Dashboard.tsx` — the one big React island. Holds the
  refresh loop, re-runs derivations on a local clock tick (so "now" follows
  the user's clock), and skips `setState` when the model cycle is unchanged
  so visx charts don't re-render on no-op refreshes.
- `src/components/` (rest) — `Header`, `NowPanel`, `charts/` (visx),
  `map/` (lazy Mapbox via `React.lazy`). Units (imperial/metric) and theme
  (system/light/dark) are cookie-backed client context.
- `src/pages/{404,500}.astro` — error pages. 500.astro is rendered
  automatically by Astro for unhandled SSR exceptions in `index.astro`'s
  frontmatter (middleware runs first, so `Astro.locals.theme` is populated).

## Conventions

- Feed timestamps are UTC; display in `America/Los_Angeles`.
- The feed carries both unit systems — the units toggle selects a field, it does not
  convert.
- Current bearing = direction the current flows TOWARD. Wind bearing = direction the
  wind comes FROM. Keep them clearly labelled.
- "Just the data": charts and readings only, no swim verdict. Light factual
  annotations (tide highs/lows, flood/ebb, nowcast/forecast boundary) are fine.

## Config

Typed env vars live in `astro.config.mjs` under `env.schema`. Use
`import { X } from "astro:env/server"` (or `"astro:env/client"`); never
`process.env`. Required-but-missing server vars throw at startup. See
`.env.example`.

- `GOODSPEED_FEED_URL` — server, required. Feed location (http(s) URL,
  `file:` URL, or path).
- `GOODSPEED_FIELD_FEED_URL` — server, optional. Gridded field feed for the
  bay map.
- `PUBLIC_MAPBOX_TOKEN` — client, optional. The bay map is hidden if absent.

## Deploy

Hosted on Netlify with the standard Git-triggered build flow. Netlify runs
`npm run check && npm run build` on every push; `check` is
`lint && typecheck && test`, so any failure blocks the deploy.
`@astrojs/netlify` writes the function bundle + redirects into `.netlify/`
automatically — no build plugin needed.

The `[[redirects]]` in `netlify.toml` proxy Plausible analytics (the script
and `/api/event`) through the dashboard's own domain so ad blockers don't
drop them. The Netlify site is configured with `base = "web"` in the
dashboard, so Netlify reads `web/netlify.toml` directly.

The repo's `../.github/workflows/ci.yml` only covers the API (deploy to Fly.io).
