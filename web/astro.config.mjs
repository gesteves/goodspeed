// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import netlify from "@astrojs/netlify";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: netlify(),
  integrations: [react()],

  // Typed env vars. Required-but-missing vars throw at startup, matching the
  // old server-side Zod validation in `src/lib/env.ts`.
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
