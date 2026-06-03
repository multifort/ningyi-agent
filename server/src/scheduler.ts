/**
 * Scheduler API — user-level scheduled (cron) AI tasks run through Hermes.
 *
 *   GET    /api/scheduler/tasks            list
 *   POST   /api/scheduler/tasks            create { name, schedule, prompt }
 *   PUT    /api/scheduler/tasks/:id        update (enable/disable/edit)
 *   DELETE /api/scheduler/tasks/:id        delete
 *   GET    /api/scheduler/tasks/:id/runs   execution history
 *
 * A single in-process ticker (startScheduler) fires due tasks. Each run
 * goes through the Hermes bridge and is saved as a new conversation.
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "./db.js";
import { authMiddleware, type AuthRequest } from "./middleware/auth.js";
import { isValidCron, nextRun } from "./cron.js";
import { hermesSend, hermesHealth } from "./hermes-bridge.js";

const router = Router();
router.use(authMiddleware);

const MAX_TASKS_PER_USER = 5;

function toSqlTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

// ── List ────────────────────────────────────────

router.get("/scheduler/tasks", (req: AuthRequest, res) => {
  const rows = db
    .prepare("SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.userId!) as Array<Record<string, unknown>>;
  res.json({ tasks: rows.map(serializeTask) });
});

function serializeTask(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    prompt: r.prompt,
    enabled: !!r.enabled,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
  };
}

// ── Create ──────────────────────────────────────

router.post("/scheduler/tasks", (req: AuthRequest, res) => {
  const { name, schedule, prompt } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ message: "请填写任务名称" }); return; }
  if (typeof schedule !== "string" || !isValidCron(schedule)) { res.status(400).json({ message: "无效的 cron 表达式（5 字段）" }); return; }
  if (typeof prompt !== "string" || !prompt.trim()) { res.status(400).json({ message: "请填写任务内容" }); return; }

  const count = db.prepare("SELECT COUNT(*) n FROM scheduled_tasks WHERE user_id = ?").get(req.userId!) as { n: number };
  if (count.n >= MAX_TASKS_PER_USER) { res.status(409).json({ message: `定时任务已达上限 (${MAX_TASKS_PER_USER})` }); return; }

  const id = randomUUID();
  const next = nextRun(schedule);
  db.prepare(
    "INSERT INTO scheduled_tasks (id, user_id, name, schedule, prompt, enabled, next_run_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  ).run(id, req.userId!, name.trim().slice(0, 100), schedule, prompt.slice(0, 8000), next ? toSqlTime(next) : null);

  const row = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id) as Record<string, unknown>;
  res.status(201).json({ task: serializeTask(row) });
});

// ── Update ──────────────────────────────────────

router.put("/scheduler/tasks/:id", (req: AuthRequest, res) => {
  const { name, schedule, prompt, enabled } = req.body ?? {};
  const existing = db
    .prepare("SELECT * FROM scheduled_tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId!) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ message: "任务不存在" }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof name === "string") { sets.push("name = ?"); vals.push(name.slice(0, 100)); }
  if (typeof prompt === "string") { sets.push("prompt = ?"); vals.push(prompt.slice(0, 8000)); }
  if (typeof schedule === "string") {
    if (!isValidCron(schedule)) { res.status(400).json({ message: "无效的 cron 表达式" }); return; }
    sets.push("schedule = ?"); vals.push(schedule);
    const next = nextRun(schedule);
    sets.push("next_run_at = ?"); vals.push(next ? toSqlTime(next) : null);
  }
  if (enabled !== undefined) {
    sets.push("enabled = ?"); vals.push(enabled ? 1 : 0);
    if (enabled) {
      const sched = typeof schedule === "string" ? schedule : (existing.schedule as string);
      const next = nextRun(sched);
      sets.push("next_run_at = ?"); vals.push(next ? toSqlTime(next) : null);
    }
  }
  if (sets.length === 0) { res.status(400).json({ message: "无更新字段" }); return; }
  vals.push(req.params.id);
  db.prepare(`UPDATE scheduled_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

  const row = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(req.params.id) as Record<string, unknown>;
  res.json({ task: serializeTask(row) });
});

// ── Delete ──────────────────────────────────────

router.delete("/scheduler/tasks/:id", (req: AuthRequest, res) => {
  db.prepare("DELETE FROM scheduled_tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.userId!);
  res.json({ success: true });
});

// ── Runs history ────────────────────────────────

router.get("/scheduler/tasks/:id/runs", (req: AuthRequest, res) => {
  const task = db
    .prepare("SELECT id FROM scheduled_tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId!);
  if (!task) { res.status(404).json({ message: "任务不存在" }); return; }

  const rows = db
    .prepare("SELECT * FROM scheduled_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 20")
    .all(req.params.id) as Array<Record<string, unknown>>;
  res.json({
    runs: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      status: r.status,
      error: r.error,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    })),
  });
});

// ── Execution engine ────────────────────────────

let _ticker: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (_ticker) return;
  // Check every 30s for due tasks
  _ticker = setInterval(() => { void tick(); }, 30_000);
  _ticker.unref();
}

async function tick(): Promise<void> {
  const now = toSqlTime(new Date());
  const due = db
    .prepare("SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?")
    .all(now) as Array<Record<string, unknown>>;

  for (const task of due) {
    // Advance next_run_at immediately to avoid double-firing
    const next = nextRun(task.schedule as string);
    db.prepare("UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ? WHERE id = ?")
      .run(now, next ? toSqlTime(next) : null, task.id);
    void runTask(task);
  }
}

async function runTask(task: Record<string, unknown>): Promise<void> {
  const runId = randomUUID();
  const conversationId = randomUUID();
  db.prepare(
    "INSERT INTO scheduled_runs (id, task_id, conversation_id, status) VALUES (?, ?, ?, 'running')",
  ).run(runId, task.id, conversationId);

  try {
    if (!(await hermesHealth())) throw new Error("Hermes 不可用");

    // Create a conversation to hold the result
    db.prepare("INSERT INTO conversations (id, user_id, title, model) VALUES (?, ?, ?, 'hermes-agent')")
      .run(conversationId, task.user_id, `⏰ ${task.name}`);
    db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)")
      .run(randomUUID(), conversationId, task.prompt);

    const resp = await hermesSend(task.prompt as string, undefined, {
      cwd: process.cwd(),
      timeoutMs: 5 * 60 * 1000,
    });

    db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)")
      .run(randomUUID(), conversationId, resp.text || "（无输出）");
    db.prepare("UPDATE scheduled_runs SET status = 'done', finished_at = ? WHERE id = ?")
      .run(toSqlTime(new Date()), runId);
  } catch (err) {
    db.prepare("UPDATE scheduled_runs SET status = 'error', error = ?, finished_at = ? WHERE id = ?")
      .run(err instanceof Error ? err.message : "执行失败", toSqlTime(new Date()), runId);
  }
}

export default router;
