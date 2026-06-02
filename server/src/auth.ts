/**
 * Auth routes — register, login, me, updateProfile.
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";

const JWT_SECRET = (process.env["JWT" + "_SECRET"]) || "hermes-chat-secret-change-me-in-production";
const TOKEN_EXPIRY = "\x37\x64"; // "7d"
const SALT_ROUNDS = 10;

function issueToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

const router = Router();

// ── Register ────────────────────────────────────

router.post("/auth/register", (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    res.status(400).json({ message: "用户名格式错误（3-30位字母数字下划线）" });
    return;
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 100) {
    res.status(400).json({ message: "密码长度需为6-100位" });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    res.status(409).json({ message: "用户名已存在" });
    return;
  }

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = db.prepare("INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)").run(username, hash, username);
  const userId = result.lastInsertRowid as number;
  const token = issueToken(userId, username);

  res.status(201).json({
    token,
    user: { id: userId, username, displayName: username, avatar: null, systemPrompt: "", hasApiKey: false },
  });
});

// ── Login ───────────────────────────────────────

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ message: "请输入用户名和密码" });
    return;
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Record<string, unknown> | undefined;
  if (!user || !bcrypt.compareSync(password as string, user.password as string)) {
    res.status(401).json({ message: "用户名或密码错误" });
    return;
  }

  const token = issueToken(user.id as number, user.username as string);
  res.json({
    token,
    user: {
      id: user.id, username: user.username, displayName: user.display_name || user.username,
      avatar: user.avatar || null, systemPrompt: user.system_prompt || "", hasApiKey: !!user.api_key,
    },
  });
});

// ── Me ──────────────────────────────────────────

router.get("/auth/me", authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId) as Record<string, unknown> | undefined;
  if (!user) { res.status(401).json({ message: "用户不存在" }); return; }
  res.json({
    user: {
      id: user.id, username: user.username, displayName: user.display_name || user.username,
      avatar: user.avatar || null, systemPrompt: user.system_prompt || "", hasApiKey: !!user.api_key,
    },
  });
});

// ── Update Profile ──────────────────────────────

router.put("/auth/profile", authMiddleware, (req: AuthRequest, res) => {
  const { displayName, avatar, systemPrompt, apiKey } = req.body ?? {};
  const userId = req.userId!;
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (displayName !== undefined) { sets.push("display_name = ?"); vals.push(String(displayName).slice(0, 20)); }
  if (avatar !== undefined) { sets.push("avatar = ?"); vals.push(avatar); }
  if (systemPrompt !== undefined) { sets.push("system_prompt = ?"); vals.push(String(systemPrompt).slice(0, 2000)); }
  if (apiKey !== undefined) { sets.push("api_key = ?"); vals.push(apiKey || null); }

  if (sets.length === 0) { res.status(400).json({ message: "未提供更新字段" }); return; }

  sets.push("updated_at = datetime('now')");
  vals.push(userId);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown>;
  res.json({
    user: {
      id: user.id, username: user.username, displayName: user.display_name || user.username,
      avatar: user.avatar || null, systemPrompt: user.system_prompt || "", hasApiKey: !!user.api_key,
    },
  });
});

export default router;
