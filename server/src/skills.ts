/**
 * Skills API — discover and invoke Hermes skills.
 *
 *   GET  /api/skills              list available skills
 *   POST /api/skills/:name/invoke run a skill (SSE stream)
 *   GET  /api/skills/history      recent invocations
 *
 * Discovery sources:
 *   1. Project skills from the repo `skills/` dir (SKILL.md frontmatter) —
 *      reliable, always available.
 *   2. Builtin skills parsed from `hermes skills list` (best-effort).
 * Filtered by ALLOWED_SKILLS env (comma list, or "*" for all).
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import db from "./db.js";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";
import { hermesStream } from "./hermes-bridge.js";

const router = Router();
router.use(authMiddleware);

interface SkillInfo {
  name: string;
  description: string;
  category: string;
  source: "project" | "builtin";
}

const ALLOWED = (process.env.ALLOWED_SKILLS ?? "*").split(",").map((s) => s.trim());
function isAllowed(name: string): boolean {
  return ALLOWED.includes("*") || ALLOWED.includes(name);
}

// ── Discovery (cached 5 min) ────────────────────

let _cache: { skills: SkillInfo[]; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function readProjectSkills(): SkillInfo[] {
  const dir = resolve(process.cwd(), "..", "skills");
  if (!existsSync(dir)) return [];
  const out: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = resolve(dir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    try {
      const content = readFileSync(skillFile, "utf-8");
      const nameMatch = /^name:\s*(.+)$/m.exec(content);
      const descMatch = /^description:\s*(.+)$/m.exec(content);
      out.push({
        name: nameMatch?.[1]?.trim() ?? entry.name,
        description: descMatch?.[1]?.trim() ?? "",
        category: "项目技能",
        source: "project",
      });
    } catch { /* skip unreadable */ }
  }
  return out;
}

function readBuiltinSkills(): SkillInfo[] {
  try {
    const r = spawnSync(process.env.HERMES_CLI_PATH ?? "hermes", ["skills", "list"], {
      encoding: "utf-8",
      timeout: 8000,
    });
    if (r.status !== 0 || !r.stdout) return [];
    const out: SkillInfo[] = [];
    for (const line of r.stdout.split("\n")) {
      // Table rows: │ name │ category │ source │ trust │ status │
      if (!line.includes("│")) continue;
      const cols = line.split("│").map((c) => c.trim());
      // cols[0] is empty (leading │)
      const name = cols[1];
      const category = cols[2];
      const source = cols[3];
      if (!name || name === "Name" || name.includes("━")) continue;
      if (source !== "builtin") continue; // project skills handled separately
      if (name.endsWith("…")) continue; // skip truncated names
      out.push({ name, description: "", category: category || "其他", source: "builtin" });
    }
    return out;
  } catch {
    return [];
  }
}

function discoverSkills(): SkillInfo[] {
  const now = Date.now();
  if (_cache && now - _cache.at < CACHE_TTL) return _cache.skills;
  const skills = [...readProjectSkills(), ...readBuiltinSkills()]
    .filter((s) => isAllowed(s.name));
  _cache = { skills, at: now };
  return skills;
}

// ── List ────────────────────────────────────────

router.get("/skills", (_req, res) => {
  res.json({ skills: discoverSkills() });
});

// ── History ─────────────────────────────────────

router.get("/skills/history", (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      "SELECT id, skill_name, input, status, created_at FROM skill_invocations WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
    )
    .all(req.userId!) as Array<Record<string, unknown>>;
  res.json({
    invocations: rows.map((r) => ({
      id: r.id,
      skillName: r.skill_name,
      input: r.input,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
});

// ── Invoke (SSE) ────────────────────────────────

const SKILL_TIMEOUT_MS = 10 * 60 * 1000;

router.post("/skills/:name/invoke", async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const skillName = String(req.params.name);
  const { input, conversationId } = (req.body ?? {}) as { input?: string; conversationId?: string };

  if (!isAllowed(skillName)) {
    res.status(403).json({ message: "该技能不可用" });
    return;
  }
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ message: "input 不能为空" });
    return;
  }

  const invocationId = randomUUID();
  db.prepare(
    "INSERT INTO skill_invocations (id, user_id, conversation_id, skill_name, input, status) VALUES (?, ?, ?, ?, ?, 'running')",
  ).run(invocationId, userId, conversationId ?? null, skillName, input.slice(0, 8000));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) aborted = true; });

  let output = "";
  try {
    for await (const { event, data } of hermesStream(input, undefined, {
      skills: [skillName],
      timeoutMs: SKILL_TIMEOUT_MS,
      cwd: process.cwd(),
    })) {
      if (aborted) break;
      if (event === "token") output += (data as { content: string }).content;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    db.prepare(
      "UPDATE skill_invocations SET output = ?, status = 'done' WHERE id = ?",
    ).run(output.slice(0, 16000), invocationId);
    if (!res.writableEnded) res.end(`event: done\ndata: ${JSON.stringify({ finished: true })}\n\n`);
  } catch (err) {
    db.prepare("UPDATE skill_invocations SET status = 'error' WHERE id = ?").run(invocationId);
    if (!res.writableEnded) {
      res.end(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "技能执行失败" })}\n\n`);
    }
  }
});

export default router;
