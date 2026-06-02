/**
 * Knowledge base — simple keyword-based document store + retrieval.
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import db from "./db.js";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";
import { readFileSync, unlink } from "node:fs";

const upload = multer({ dest: "data/uploads/", limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authMiddleware);

// Upload document
router.post("/knowledge", upload.single("file"), (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ message: "请上传文件" }); return; }

  let content = "";
  try {
    content = readFileSync(file.path, "utf-8").slice(0, 100000);
  } catch {
    content = "[无法读取的文件]";
  } finally {
    // Remove the temp file immediately after reading — content is stored in DB
    unlink(file.path, () => {});
  }

  const id = randomUUID();
  db.prepare("INSERT INTO knowledge_base (id, user_id, name, content) VALUES (?,?,?,?)")
    .run(id, req.userId!, file.originalname, content);

  res.status(201).json({ id, name: file.originalname, size: content.length });
});

// List documents
router.get("/knowledge", (req: AuthRequest, res) => {
  const rows = db.prepare("SELECT id, name, length(content) as size, created_at FROM knowledge_base WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.userId!) as Array<Record<string, unknown>>;
  res.json({ documents: rows.map(r => ({ id: r.id, name: r.name, size: r.size, createdAt: r.created_at })) });
});

// Delete document
router.delete("/knowledge/:id", (req: AuthRequest, res) => {
  db.prepare("DELETE FROM knowledge_base WHERE id = ? AND user_id = ?").run(req.params.id, req.userId!);
  res.json({ success: true });
});

// Search knowledge
router.get("/knowledge/search", (req: AuthRequest, res) => {
  const q = (req.query.q as string) || "";
  if (!q.trim()) { res.json({ results: [] }); return; }

  const rows = db.prepare(
    "SELECT id, name, substr(content, max(0, instr(lower(content), lower(?)) - 100), 300) as snippet FROM knowledge_base WHERE user_id = ? AND content LIKE ? LIMIT 10"
  ).all(q, req.userId!, `%${q}%`) as Array<Record<string, unknown>>;

  // Also search in conversations
  const convRows = db.prepare(
    "SELECT c.id, c.title as name, substr(m.content, max(0, instr(lower(m.content), lower(?)) - 100), 300) as snippet FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.content LIKE ? LIMIT 5"
  ).all(q, req.userId!, `%${q}%`) as Array<Record<string, unknown>>;

  res.json({
    results: [
      ...rows.map(r => ({ id: r.id, name: r.name, snippet: r.snippet, source: "knowledge" as const })),
      ...convRows.map(r => ({ id: r.id, name: r.name, snippet: r.snippet, source: "conversation" as const })),
    ].slice(0, 15),
  });
});

export default router;
