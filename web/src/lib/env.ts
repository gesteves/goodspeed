import { z } from "zod";

/**
 * Server-only environment schema. Imported transitively from data-source
 * modules so that the first server request to anything that reads a feed will
 * fail loud at module load if the env is misconfigured -- rather than letting
 * a per-request `if (!process.env.X) throw` surface only when someone happens
 * to hit the page.
 *
 * Add new server env vars here, not as ad-hoc `process.env.X` reads.
 */
const ServerEnvSchema = z.object({
  GOODSPEED_FEED_URL: z
    .string()
    .min(1, "GOODSPEED_FEED_URL is required (http(s)://, file://, or filesystem path) -- see web/.env.example"),
  GOODSPEED_FIELD_FEED_URL: z.string().min(1).optional(),
});

const result = ServerEnvSchema.safeParse(process.env);

if (!result.success) {
  const detail = result.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${detail}`);
}

export const env = result.data;
