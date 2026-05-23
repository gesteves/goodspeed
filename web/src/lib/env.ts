import {
  GOODSPEED_FEED_URL,
  GOODSPEED_FIELD_FEED_URL,
} from "astro:env/server";

/**
 * Server-only environment values, re-exported through this module so callers
 * can keep using `import { env } from "@/lib/env"` regardless of the source.
 *
 * Validation happens in `astro.config.mjs` via `envField` -- required vars
 * missing at startup throw before the first request is served. Add new server
 * env vars to the `env.schema` in `astro.config.mjs` (and to `.env.example`),
 * not as ad-hoc `process.env.X` reads.
 */
export const env = {
  GOODSPEED_FEED_URL,
  GOODSPEED_FIELD_FEED_URL,
};
