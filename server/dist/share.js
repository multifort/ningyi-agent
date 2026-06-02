/**
 * Share links — anonymous read-only conversation sharing.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
const router = Router();
// Ensure share_tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS share_tokens (
    token            TEXT PRIMARY KEY,
    conversation_id  TEXT NOT NULL,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);
// Generate share link
router.post("/conversations/:id/share", authMiddleware, (req, res) => {
    const conv = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
        .get(req.params.id, req.userId);
    if (!conv) {
        res.status(404).json({ message: "对话不存在" });
        return;
    }
    const token = randomUUID().replace(/-/g, "").slice(0, 16);
    db.prepare("INSERT OR REPLACE INTO share_tokens (token, conversation_id) VALUES (?, ?)").run(token, conv.id);
    res.json({ token, url: `/share/${token}` });
});
// View shared conversation (no auth required)
router.get("/share/:token", (req, res) => {
    const row = db.prepare("SELECT c.title, c.id FROM share_tokens s JOIN conversations c ON c.id = s.conversation_id WHERE s.token = ?").get(req.params.token);
    if (!row) {
        res.status(404).send("链接无效或已过期");
        return;
    }
    const messages = db.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at")
        .all(row.id);
    let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${row.title} - 宁翼分享</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#f9fafb;color:#1a1a1a}
h1{font-size:1.3rem;border-bottom:2px solid #4d6bfe;padding-bottom:10px}
.msg{margin:16px 0;padding:12px 16px;border-radius:10px}
.user{background:#e8edfb;text-align:right}.assistant{background:#fff;border:1px solid #e5e7eb}
.role{font-size:.75rem;color:#6b7280;margin-bottom:4px}pre{background:#1e1e2e;color:#e5e5e5;padding:12px;border-radius:8px;overflow-x:auto}
</style></head><body><h1>${row.title}</h1>`;
    for (const m of messages) {
        html += `<div class="msg ${m.role}"><div class="role">${m.role === "user" ? "🧑 用户" : "🤖 宁翼助手"}</div><div>${m.content.replace(/\n/g, "<br>")}</div></div>`;
    }
    html += `<p style="text-align:center;color:#9ca3af;margin-top:30px;font-size:.8rem">由 宁翼智能助手 分享</p></body></html>`;
    res.send(html);
});
export default router;
//# sourceMappingURL=share.js.map