import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadSettings } from "./config.js";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const DDL = [
  `CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  thread_id text NOT NULL UNIQUE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  extra jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages(conversation_id)`,
];

let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;
  const settings = loadSettings();
  if (settings.postgresEnabled) {
    db = drizzlePg(postgres(settings.DATABASE_URL, { max: 10 }), { schema });
  } else {
    db = drizzlePglite(new PGlite(), { schema });
  }
  return db;
}

/** Create app tables if missing (idempotent). Runs on startup for both drivers. */
export async function initSchema(): Promise<void> {
  for (const statement of DDL) {
    await getDb().execute(sql.raw(statement));
  }
}
