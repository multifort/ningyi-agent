/**
 * SQLite database — single-file, zero-config.
 * File lives at <project_root>/data/hermes.db
 */
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const DATA_DIR = resolve(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = resolve(DATA_DIR, "hermes.db");
const db = new Database(DB_PATH);
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
`);
// Indexes (IF NOT EXISTS not supported for indexes in SQLite, catch dup)
for (const idx of [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    "CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at)",
]) {
    try {
        db.exec(idx);
    }
    catch { /* index already exists */ }
}
export default db;
//# sourceMappingURL=db.js.map