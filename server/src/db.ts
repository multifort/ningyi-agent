/**
 * SQLite database — single-file, zero-config.
 * File lives at <project_root>/data/hermes.db
 */

import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const DATA_DIR = resolve(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = resolve(DATA_DIR, "hermes.db");

const db: Database.Database = new Database(DB_PATH);

// Performance & safety
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ──────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password      TEXT    NOT NULL,
    avatar        TEXT,
    display_name  TEXT    NOT NULL DEFAULT '',
    system_prompt TEXT    NOT NULL DEFAULT '',
    api_key       TEXT,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT    NOT NULL DEFAULT '新对话',
    model       TEXT    NOT NULL DEFAULT 'deepseek-chat',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT    PRIMARY KEY,
    conversation_id TEXT    NOT NULL,
    role            TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
    content         TEXT    NOT NULL,
    token_count     INTEGER DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS knowledge_base (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS share_tokens (
    token           TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  -- JWT blacklist for explicit logout. Entries expire with the token itself.
  CREATE TABLE IF NOT EXISTS token_blacklist (
    jti        TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );

  -- Maps our conversation IDs to Hermes session IDs (for resume)
  CREATE TABLE IF NOT EXISTS agent_sessions (
    conversation_id  TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    hermes_session   TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Indexes (IF NOT EXISTS not supported for indexes in SQLite, catch dup)
for (const idx of [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  "CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at)",
]) {
  try { db.exec(idx); } catch { /* index already exists */ }
}

// FTS5 virtual table for full-text search over message content + conversation titles.
// content='' means external-content mode — we manage inserts/deletes via triggers.
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      conversation_id UNINDEXED,
      content=messages,
      content_rowid=rowid
    );

    -- Keep FTS in sync with messages table
    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, conversation_id) VALUES (new.rowid, new.content, new.conversation_id);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id) VALUES ('delete', old.rowid, old.content, old.conversation_id);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id) VALUES ('delete', old.rowid, old.content, old.conversation_id);
      INSERT INTO messages_fts(rowid, content, conversation_id) VALUES (new.rowid, new.content, new.conversation_id);
    END;
  `);
} catch { /* already exists */ }

// Also add token_version column to existing DBs that predate this migration
try {
  db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
} catch { /* column already exists */ }

// Periodically purge expired blacklist entries (runs every hour, non-blocking)
setInterval(() => {
  db.prepare("DELETE FROM token_blacklist WHERE expires_at <= datetime('now')").run();
}, 60 * 60 * 1000).unref();

export default db;
