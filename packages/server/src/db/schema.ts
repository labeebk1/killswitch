import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["lobby", "live", "ended", "cancelled"] })
    .notNull()
    .default("lobby"),
  durationSec: integer("duration_sec").notNull().default(1800),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  metadata: text("metadata"), // JSON
});

export const matchCompetitors = sqliteTable("match_competitors", {
  matchId: text("match_id")
    .notNull()
    .references(() => matches.id),
  slot: integer("slot").notNull(), // 0..3, composite PK with matchId
  displayName: text("display_name").notNull(),
  slotKey: text("slot_key").notNull().unique(), // plaintext for v1
  joinedAt: text("joined_at").notNull(),
  leftAt: text("left_at"),
  ready: integer("ready", { mode: "boolean" }).notNull().default(false),
});

export const matchEvents = sqliteTable("match_events", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => matches.id),
  slot: integer("slot"),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(), // JSON
  ts: text("ts").notNull(),
});
