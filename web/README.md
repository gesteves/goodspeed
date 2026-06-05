# Goodspeed web dashboard

Astro 6 + React 19 SPA that renders the feed published by `../api/`.

## Local dev

Use Node LTS (`nvm use` reads `.nvmrc`).

```bash
cp .env.example .env
# point GOODSPEED_FEED_URL at a live URL or a local feed file
npm install
netlify dev
```

Runs at http://localhost:8888 (Netlify dev runs `astro dev` behind its proxy and
also serves the `netlify/functions/*` image endpoints).

> **Use `netlify dev`, not bare `npm run dev`.** The `@astrojs/netlify` adapter
> expects the Netlify CLI's local runtime; starting `astro dev` directly
> (`npm run dev`) throws an unhandled rejection about the Edge Functions dev
> server and never comes up. Needs the Netlify CLI (`npm i -g netlify-cli`).

### Env vars

Typed in `astro.config.mjs` under `env.schema`; see `.env.example`.

- `GOODSPEED_FEED_URL` — required. Point feed location (http(s) URL,
  `file:` URL, or path).
- `GOODSPEED_FIELD_FEED_URL` — optional. Gridded field feed for the bay map.
- `PUBLIC_MAPBOX_TOKEN` — optional. The bay map is hidden if absent.

## Commands

- `netlify dev` — local dev server (see Local dev; **not** bare `npm run dev`)
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint
- `npm run typecheck` — `astro check`
- `npm test` — Vitest (unit tests + schema-sync guard)
- `npm run check` — lint + typecheck + tests (what CI runs)

## Map image export

`npm run map-image` renders a high-res PNG of the bay map (current arrows,
legend, swim start/finish) at a given time — handy for embedding in a blog
post. Requires `GOODSPEED_FIELD_FEED_URL` and `MAPBOX_STATIC_TOKEN` (an
unrestricted token) in `.env.local`.

```bash
npm run map-image                          # prompts; blank = current conditions
npm run map-image -- "8:30am June 8 2026"  # natural-language date/time
```

Output lands in `map-exports/` (gitignored). Flags: `--out <path>`,
`--theme light|dark`, `--units imperial|metric`, `--arrow-scale <n>`.

The same image is also served live by the deployed site:

- `/images/map/current.png` — current conditions
- `/images/map/today/HHMM.png` — that time today (24h, Pacific),
  e.g. `/images/map/today/0830.png`
- `/images/map/tomorrow/HHMM.png` — that time tomorrow (Pacific),
  e.g. `/images/map/tomorrow/0700.png`

These 404 when the requested time is outside the field feed's coverage.
Add `?theme=dark` or `?units=metric` to match the CLI flags. (`/images/og.png`
is the social share card — a separate, smaller crop.)

## Deploy

Hosted on Netlify. `netlify.toml` lives in this directory (`web/netlify.toml`)
because the Netlify site is configured with `base = "web"`; pushes to the
linked branch trigger a build that runs `npm run check && npm run build`. The
`@astrojs/netlify` adapter writes the function bundle + `_redirects` into
`.netlify/` automatically.
