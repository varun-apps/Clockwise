import { resolve } from "node:path";
import { z } from "zod";

// Load a local `.env` if present (no-op otherwise). Node's built-in loader keeps
// us free of a dotenv dependency.
try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  // No `.env` file — rely on real environment variables.
}

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLOCKWISE_ENV: z.string().default("local"),
  CLOCKWISE_LOG_LEVEL: z.string().default("info"),
  CLOCKWISE_CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // Empty/unset => embedded PGlite + in-memory checkpointer/store (offline).
  // Set to a postgres:// URL to use Postgres for app data, checkpoints, and memory.
  DATABASE_URL: z.string().default(""),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  CLOCKWISE_MODEL_DEFAULT: z.string().default("deepseek/deepseek-chat"),
  CLOCKWISE_MODEL_SYNTHESIS: z.string().default("deepseek/deepseek-chat"),
  CLOCKWISE_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  CLOCKWISE_EMBEDDING_DIMS: z.coerce.number().int().positive().default(1536),

  AVIATIONSTACK_KEY: z.string().optional(),
  TAVILY_KEY: z.string().optional(),
  OPENWEATHERMAP_KEY: z.string().optional(),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().default("http://localhost:3000"),
});

type RawEnv = z.infer<typeof RawEnvSchema>;

export interface AppSettings extends RawEnv {
  corsOrigins: string[];
  postgresEnabled: boolean;
  langfuseEnabled: boolean;
}

function derive(raw: RawEnv): AppSettings {
  return {
    ...raw,
    corsOrigins: raw.CLOCKWISE_CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    postgresEnabled:
      raw.DATABASE_URL.startsWith("postgresql://") || raw.DATABASE_URL.startsWith("postgres://"),
    langfuseEnabled: Boolean(raw.LANGFUSE_PUBLIC_KEY && raw.LANGFUSE_SECRET_KEY),
  };
}

let cached: AppSettings | undefined;

/** Read + validate environment once per process. */
export function loadSettings(): AppSettings {
  if (!cached) {
    cached = derive(RawEnvSchema.parse(process.env));
  }
  return cached;
}

/** Fail fast at boot listing every missing key — ClockWise runs live-only. */
export function requireApiKeys(settings: AppSettings): void {
  const missing = (
    [
      ["OPENROUTER_API_KEY", settings.OPENROUTER_API_KEY],
      ["AVIATIONSTACK_KEY", settings.AVIATIONSTACK_KEY],
      ["TAVILY_KEY", settings.TAVILY_KEY],
      ["OPENWEATHERMAP_KEY", settings.OPENWEATHERMAP_KEY],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required API key(s): ${missing.join(", ")}. Copy .env.example to .env and set them — there is no dummy-data fallback.`,
    );
  }
}
