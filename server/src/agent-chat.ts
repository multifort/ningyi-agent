/**
 * POST /api/chat  (mode: "agent")
 *
 * Routes the request through Hermes Agent instead of DeepSeek directly.
 * Maintains Hermes session continuity by storing the session ID against
 * our conversation ID in the agent_sessions table.
 *
 * SSE events emitted:
 *   thinking  — Hermes is processing (sent immediately so UI shows spinner)
 *   token     — incremental response text
 *   done      — finished, includes conversationId
 *   error     — something went wrong
 */

import type { Response } from "express";
import { randomUUID } from "node:crypto";
import type { AuthRequest } from "./middleware/auth.js";
import db from "./db.js";
import { hermesStream, hermesHealth } from "./hermes-bridge.js";

function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function endSSE(res: Response, event: string, data: unknown): void {
  res.end(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function handleAgentChat(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId!;
  const { messages, conversationId: reqConvId } = req.body as {
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  };

  // Validate
  if (!Array.isArray(messages) || messages.length === 0) {
    endSSE(res, "error", { message: "messages 不能为空" });
    return;
  }

  // Check Hermes availability
  const healthy = await hermesHealth();
  if (!healthy) {
    endSSE(res, "error", {
      message: "Hermes Agent 当前不可用，请检查安装或切换为 Chat 模式",
      fallback: true,
    });
    return;
  }

  // Resolve / create conversation
  let conversationId = reqConvId;
  if (conversationId) {
    const conv = db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .get(conversationId, userId);
    if (!conv) conversationId = undefined;
  }
  if (!conversationId) {
    conversationId = randomUUID();
    db.prepare("INSERT INTO conversations (id, user_id, model) VALUES (?, ?, ?)").run(
      conversationId,
      userId,
      "hermes-agent",
    );
  }

  // Build prompt: take the latest user message as the prompt.
  // For multi-turn, Hermes session resume handles context — we only send
  // the newest user message after the first turn.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    endSSE(res, "error", { message: "没有找到用户消息" });
    return;
  }

  // Save user message to DB
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
  ).run(randomUUID(), conversationId, "user", lastUser.content);
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(
    conversationId,
  );

  // Auto-title
  const conv = db
    .prepare("SELECT title FROM conversations WHERE id = ?")
    .get(conversationId) as { title: string };
  if (conv?.title === "新对话") {
    const t =
      lastUser.content.slice(0, 30) + (lastUser.content.length > 30 ? "…" : "");
    db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(t, conversationId);
  }

  // Look up existing Hermes session for this conversation (for resume)
  const agentSession = db
    .prepare("SELECT hermes_session FROM agent_sessions WHERE conversation_id = ?")
    .get(conversationId) as { hermes_session: string } | undefined;
  const hermesSessionId = agentSession?.hermes_session;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Abort on client disconnect
  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) aborted = true;
  });

  let fullContent = "";
  let newHermesSessionId = hermesSessionId;
  const assistantMsgId = randomUUID();
  const toolCallRows: Array<{ stepId: number; name: string; input: string; durationMs: number | null }> = [];

  try {
    for await (const { event, data } of hermesStream(
      lastUser.content,
      hermesSessionId,
      { cwd: process.cwd() },
    )) {
      if (aborted) break;

      if (event === "token") {
        fullContent += (data as { content: string }).content;
      }

      if (event === "tool_start") {
        const d = data as { stepId: number; toolName: string; input: string };
        toolCallRows.push({ stepId: d.stepId, name: d.toolName, input: d.input, durationMs: null });
      }

      if (event === "tool_end") {
        const d = data as { stepId: number; durationMs: number | null };
        const row = toolCallRows.find((r) => r.stepId === d.stepId);
        if (row) row.durationMs = d.durationMs;
      }

      if (event === "done") {
        newHermesSessionId = (data as { sessionId?: string }).sessionId ?? hermesSessionId;
      }

      sendSSE(res, event, data);
    }
  } catch (err) {
    if (!res.writableEnded) {
      endSSE(res, "error", {
        message: err instanceof Error ? err.message : "Agent 出错",
      });
      return;
    }
  }

  if (!aborted) {
    // Persist assistant reply
    if (fullContent) {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
      ).run(assistantMsgId, conversationId, "assistant", fullContent);
      db.prepare(
        "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
      ).run(conversationId);
    }

    // Persist tool calls for traceability
    for (const t of toolCallRows) {
      db.prepare(`
        INSERT INTO tool_calls (id, conversation_id, message_id, step_index, tool_name, input, status, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, 'done', ?)
      `).run(randomUUID(), conversationId, assistantMsgId, t.stepId, t.name, t.input, t.durationMs);
    }

    // Persist / update Hermes session mapping
    if (newHermesSessionId) {
      db.prepare(`
        INSERT INTO agent_sessions (conversation_id, hermes_session, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(conversation_id) DO UPDATE SET
          hermes_session = excluded.hermes_session,
          updated_at = datetime('now')
      `).run(conversationId, newHermesSessionId);
    }

    if (!res.writableEnded) {
      endSSE(res, "done", { conversationId, finished: true });
    }
  } else {
    if (!res.writableEnded) res.end();
  }
}
