/**
 * Conversations API — CRUD for user conversations and messages.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
const router = Router();
router.use(authMiddleware);
// ── List conversations ──────────────────────────
router.get("/conversations", (req, res) => {
    const rows = db
        .prepare(`SELECT c.*, 
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`)
        .all(req.userId);
    res.json({
        conversations: rows.map((r) => ({
            id: r.id,
            title: r.title,
            model: r.model,
            messageCount: r.message_count,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        })),
    });
});
// ── Create conversation ─────────────────────────
router.post("/conversations", (req, res) => {
    const id = randomUUID();
    const title = req.body?.title?.slice(0, 100) || "新对话";
    db.prepare("INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)").run(id, req.userId, title);
    const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    res.status(201).json({
        conversation: {
            id: row.id,
            title: row.title,
            model: row.model,
            messageCount: 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        },
    });
});
// ── Rename conversation ─────────────────────────
router.put("/conversations/:id", (req, res) => {
    const { id } = req.params;
    const title = req.body?.title?.slice(0, 100);
    if (!title) {
        res.status(400).json({ message: "标题不能为空" });
        return;
    }
    const conv = db
        .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
        .get(id, req.userId);
    if (!conv) {
        res.status(404).json({ message: "对话不存在" });
        return;
    }
    db.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
    res.json({ conversation: { id, title } });
});
// ── Delete conversation ─────────────────────────
router.delete("/conversations/:id", (req, res) => {
    const { id } = req.params;
    const conv = db
        .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
        .get(id, req.userId);
    if (!conv) {
        res.status(404).json({ message: "对话不存在" });
        return;
    }
    db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    res.json({ success: true });
});
// ── Get messages ────────────────────────────────
router.get("/conversations/:id/messages", (req, res) => {
    const { id } = req.params;
    const conv = db
        .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
        .get(id, req.userId);
    if (!conv) {
        res.status(404).json({ message: "对话不存在" });
        return;
    }
    const rows = db
        .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at")
        .all(id);
    res.json({
        messages: rows.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            tokenCount: m.token_count,
            createdAt: m.created_at,
        })),
    });
});
// ── Search conversations ──────────────────────
router.get("/conversations/search", (req, res) => {
    const q = req.query.q || "";
    if (!q.trim()) {
        res.json({ results: [] });
        return;
    }
    const rows = db
        .prepare(`SELECT DISTINCT c.id, c.title, c.updated_at,
        (SELECT content FROM messages WHERE conversation_id = c.id AND content LIKE ? LIMIT 1) as snippet
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = ? AND (c.title LIKE ? OR m.content LIKE ?)
       ORDER BY c.updated_at DESC LIMIT 20`)
        .all(`%${q}%`, req.userId, `%${q}%`, `%${q}%`);
    res.json({
        results: rows.map((r) => ({
            conversationId: r.id,
            title: r.title,
            snippet: r.snippet?.slice(0, 200),
            updatedAt: r.updated_at,
        })),
    });
});
// ── Export conversation ────────────────────────
router.get("/conversations/:id/export", (req, res) => {
    const { id } = req.params;
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!conv) {
        res.status(404).json({ message: "对话不存在" });
        return;
    }
    const rows = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at").all(id);
    let md = `# ${conv.title}\n\n`;
    md += `> 导出时间: ${new Date().toISOString()}\n\n---\n\n`;
    for (const m of rows) {
        const role = m.role === "user" ? "🧑 用户" : "🤖 助手";
        md += `### ${role}\n\n${m.content}\n\n---\n\n`;
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${conv.title.slice(0, 20)}.md"`);
    res.send(md);
});
export default router;
//# sourceMappingURL=conversations.js.map