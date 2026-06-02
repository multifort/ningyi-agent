/**
 * SQLite database — single-file, zero-config.
 * File lives at <project_root>/data/hermes.db
 */
import Database from "better-sqlite3";
declare const db: Database.Database;
export default db;
