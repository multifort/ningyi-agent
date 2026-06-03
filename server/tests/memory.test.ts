/**
 * Tests for memory persistence helpers (upsert + inject).
 * Uses the real SQLite store with a throwaway user (same pattern as chat.test).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import db from "../src/db.js";
import { saveExtractedMemories, buildInjectText } from "../src/memory.js";

describe("memory helpers", () => {
  let userId: number;

  beforeEach(() => {
    const r = db
      .prepare("INSERT INTO users (username, password) VALUES (?, ?)")
      .run(`_memtest_${Date.now()}_${Math.random()}`, "hash");
    userId = r.lastInsertRowid as number;
  });

  afterEach(() => {
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });

  it("saves extracted facts", () => {
    saveExtractedMemories(userId, [
      { key: "lang", content: "用户喜欢 TypeScript" },
      { key: "tz", content: "UTC+8" },
    ]);
    const n = db.prepare("SELECT COUNT(*) n FROM memories WHERE user_id = ?").get(userId) as { n: number };
    expect(n.n).toBe(2);
  });

  it("upserts by key (no duplicates)", () => {
    saveExtractedMemories(userId, [{ key: "lang", content: "TypeScript" }]);
    saveExtractedMemories(userId, [{ key: "lang", content: "Rust" }]);
    const rows = db.prepare("SELECT content FROM memories WHERE user_id = ? AND key = 'lang'").all(userId) as Array<{ content: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Rust");
  });

  it("ignores empty facts", () => {
    saveExtractedMemories(userId, [
      { key: "", content: "x" },
      { key: "k", content: "" },
    ]);
    const n = db.prepare("SELECT COUNT(*) n FROM memories WHERE user_id = ?").get(userId) as { n: number };
    expect(n.n).toBe(0);
  });

  it("builds an inject summary within the char budget", () => {
    saveExtractedMemories(userId, [{ key: "lang", content: "TypeScript" }]);
    const text = buildInjectText(userId);
    expect(text).toContain("用户长期记忆");
    expect(text).toContain("lang");
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  it("returns empty string when no memories", () => {
    expect(buildInjectText(userId)).toBe("");
  });
});
