# Goodspeed web dashboard

Astro 6 + React 19 SPA that renders the feed published by `../api/`.

## Local dev

Use Node LTS (`nvm use` reads `.nvmrc`).

```bash
cp .env.example .env
# point GOODSPEED_FEED_URL at a live URL or a local feed file
npm install
npm run dev
```

Dev server runs at http://localhost:4321.

### Env vars

Typed in `astro.config.mjs` under `env.schema`; see `.env.example`.

- `GOODSPEED_FEED_URL` — required. Point feed location (http(s) URL,
  `file:` URL, or path).
- `GOODSPEED_FIELD_FEED_URL` — optional. Gridded field feed for the bay map.
- `PUBLIC_MAPBOX_TOKEN` — optional. The bay map is hidden if absent.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint
- `npm run typecheck` — `astro check`
- `npm test` — Vitest (unit tests + schema-sync guard)
- `npm run check` — lint + typecheck + tests (what CI runs)

## Deploy

Hosted on Netlify. `netlify.toml` lives in this directory (`web/netlify.toml`)
because the Netlify site is configured with `base = "web"`; pushes to the
linked branch trigger a build that runs `npm run check && npm run build`. The
`@astrojs/netlify` adapter writes the function bundle + `_redirects` into
`.netlify/` automatically.
