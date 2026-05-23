# Goodspeed web dashboard — agent notes

This project is built with **Astro 6** + a React 19 island for the interactive
surface. It used to be Next.js 16; the migration is complete and there is no
`next/*` import anywhere. If you find one, that's a bug, not a fallback.

Things worth knowing:

- `src/pages/index.astro` does the initial server-side data fetch + derivation
  and mounts a single `<Dashboard client:load>` island.
- `src/pages/dashboard.json.ts` is the refresh endpoint the island polls every
  60 seconds. It is intentionally NOT under `/api/` (that namespace is
  proxied to Plausible by `netlify.toml`).
- Cookies are read once per request in `src/middleware.ts` and exposed via
  `Astro.locals`.
- Typed env vars live in `astro.config.mjs` (`env.schema`). Use
  `import { X } from "astro:env/server"` (or `"astro:env/client"`) — never
  `process.env`.
