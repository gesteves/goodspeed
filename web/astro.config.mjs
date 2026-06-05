// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import netlify from "@astrojs/netlify";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  // `site` is read by `Astro.site`, used by the layout to build the absolute
  // og:image URL in prerendered HTML. Netlify exposes the deploy's primary
  // URL as `URL` at build time, so production, branch deploys, and deploy
  // previews each get the right origin without hardcoding. Falls back to the
  // dev server origin for local `astro build` / `astro dev`.
  site: process.env.URL ?? "http://localhost:4321",
  output: "server",
  adapter: netlify(),
  integrations: [react()],

  // Typed env vars. Required-but-missing vars throw at startup; `src/lib/env.ts`
  // is now a thin re-export of the validated values from `astro:env/server`.
  env: {
    schema: {
      GOODSPEED_FEED_URL: envField.string({
        context: "server",
        access: "secret",
      }),
      GOODSPEED_FIELD_FEED_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PUBLIC_MAPBOX_TOKEN: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_PLAUSIBLE_SCRIPT_ID: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_RACE_START: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
    },
  },

  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
