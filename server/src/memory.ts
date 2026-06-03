/**
 * Memory API — persistent, cross-session user memory.
 *
 *   GET    /api/memory            list user's memories
 *   POST   /api/memory            add { key, content }
 *   PUT    /api/memory/:id        update { content } (or key)
 *   DELETE /api/memory/:id        delete
 *   GET    /api/memory/inject     compact summary for system-prompt injection
 *
 * Also exports extractMemories() used by agent-chat to auto-capture facts.
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const MAX_MEMORIES_PER_USER = 200;
const INJECT_CHAR_BUDGET = 2000;

// ── List ────────────────────────────────────────

router.get("/memory", (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      "SELECT id, key, content, source, created_at, updated_at FROM memories WHERE user_id = ? ORDER BY updated_at DESC",
    )
    .all(req.userId!) as Array<Record<string, unknown>>;
  res.json({
    memories: rows.map((r) => ({
      id: r.id,
      key: r.key,
      content: r.content,
      source: r.source,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// ── Add ─────────────────────────────────────────

router.post("/memory", (req: AuthRequest, res) => {
  const { key, content } = req.body ?? {};
  if (typeof key !== "string" || !key.trim() || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ message: "key 和 content 不能为空" });
    return;
  }

  const count = db
    .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ?")
    .get(req.userId!) as { n: number };
  if (count.n >= MAX_MEMORIES_PER_USER) {
    res.status(409).json({ message: `记忆条目已达上限 (${MAX_MEMORIES_PER_USER})` });
    return;
  }

  const id = randomUUID();
  try {
    db.prepare(
      "INSERT INTO memories (id, user_id, key, content, source) VALUES (?, ?, ?, ?, 'manual')",
    ).run(id, req.userId!, key.trim().slice(0, 100), content.trim().slice(0, 4000));
  } catch {
    // UNIQUE(user_id, key) conflict — update instead
    db.prepare(
      "UPDATE memories SET content = ?, updated_at = datetime('now') WHERE user_id = ? AND key = ?",
    ).run(content.trim().slice(0, 4000), req.userId!, key.trim().slice(0, 100));
  }

  res.status(201).json({ id });
});

// ── Update ──────────────────────────────────────

router.put("/memory/:id", (req: AuthRequest, res) => {
  const { content, key } = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof content === "string") { sets.push("content = ?"); vals.push(content.slice(0, 4000)); }
  if (typeof key === "string") { sets.push("key = ?"); vals.push(key.slice(0, 100)); }
  if (sets.length === 0) { res.status(400).json({ message: "无更新字段" }); return; }
  sets.push("updated_at = datetime('now')");
  vals.push(req.params.id, req.userId!);

  const r = db
    .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .run(...vals);
  if (r.changes === 0) { res.status(404).json({ message: "记忆不存在" }); return; }
  res.json({ success: true });
});

// ── Delete ──────────────────────────────────────

router.delete("/memory/:id", (req: AuthRequest, res) => {
  db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(req.params.id, req.userId!);
  res.json({ success: true });
});

// ── Inject summary ──────────────────────────────

router.get("/memory/inject", (req: AuthRequest, res) => {
  res.json({ text: buildInjectText(req.userId!) });
});

export function buildInjectText(userId: number): string {
  const rows = db
    .prepare("SELECT key, content FROM memories WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as Array<{ key: string; content: string }>;
  if (rows.length === 0) return "";

  let out = "已知的用户长期记忆（供参考）：\n";
  for (const r of rows) {
    const line = `- ${r.key}：${r.content}\n`;
    if (out.length + line.length > INJECT_CHAR_BUDGET) break;
    out += line;
  }
  return out.trim();
}

// ── Auto-extraction (used by agent-chat) ────────

/**
 * Store a list of extracted { key, content } facts for a user.
 * Upserts by (user_id, key). Marked source='auto'.
 */
export function saveExtractedMemories(
  userId: number,
  facts: Array<{ key: string; content: string }>,
): void {
  for (const f of facts) {
    if (!f.key?.trim() || !f.content?.trim()) continue;
    const key = f.key.trim().slice(0, 100);
    const content = f.content.trim().slice(0, 4000);
    const existing = db
      .prepare("SELECT id FROM memories WHERE user_id = ? AND key = ?")
      .get(userId, key) as { id: string } | undefined;
    if (existing) {
      db.prepare(
        "UPDATE memories SET content = ?, source = 'auto', updated_at = datetime('now') WHERE id = ?",
      ).run(content, existing.id);
    } else {
      db.prepare(
        "INSERT INTO memories (id, user_id, key, content, source) VALUES (?, ?, ?, ?, 'auto')",
      ).run(randomUUID(), userId, key, content);
    }
  }
}

export default router;
