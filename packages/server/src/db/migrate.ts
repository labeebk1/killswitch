import { sqlite } from "./index";

// Inline DDL for v1 SQLite — avoids needing drizzle-kit migration files at runtime
export function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'lobby',
      duration_sec INTEGER NOT NULL DEFAULT 1800,
      created_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS match_competitors (
      match_id TEXT NOT NULL REFERENCES matches(id),
      slot INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      slot_key TEXT NOT NULL UNIQUE,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      ready INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (match_id, slot)
    );

    CREATE TABLE IF NOT EXISTS match_events (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id),
      slot INTEGER,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      ts TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_competitors_slot_key ON match_competitors(slot_key);
  `);
}
