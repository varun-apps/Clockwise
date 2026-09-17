import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Drizzle schema (Postgres dialect). We use the Postgres dialect everywhere and
 * run offline tests against PGlite (an embedded Postgres), so there is a single
 * schema definition with no SQLite/Postgres fork. IDs are text UUIDs assigned in
 * application code (crypto.randomUUID()) so PGlite and Postgres behave the same.
 */

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  extra: jsonb("extra"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
