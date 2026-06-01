/**
 * POST /api/chat — SSE proxy to DeepSeek chat API.
 *
 * Request:  { messages: [{ role, content }, ...] }
 * Response: text/event-stream emitting token / done / error events.
 *
 * Cancellation: when the client disconnects, the upstream DeepSeek request
 * is aborted. Node 24 native fetch + AbortSignal handle this.
 */

import type { Request, Response } from "express";
import { appendFileSync } from "node:fs";

const LOG = "/tmp/hermes-chat.log";
function log(msg: string) {
  try { appendFileSync(LOG, new Date().toISOString() + " " + msg + "\n"); } catch {}
}

const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const MAX_TOKENS = 4096;
const MAX_MESSAGES = 100;
const MAX_CONTENT_LENGTH = 8000;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Format a single SSE event as a string. */
function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Write an SSE event to the response stream (for ongoing streaming). */
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(formatSSE(event, data));
}

/** Send a single SSE event and end the response. */
function endSSE(res: Response, event: string, data: unknown): void {
  res.end(formatSSE(event, data));
}

/** Validate the incoming chat request body. Returns null if valid, or an error string. */
export function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }
  const { messages } = body as Record<string, unknown>;

  if (!Array.isArray(messages) || messages.length === 0) {
    return "`messages` must be a non-empty array.";
  }
  if (messages.length > MAX_MESSAGES) {
    return `Too many messages (max ${MAX_MESSAGES}).`;
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== "object") {
      return `messages[${i}] must be an object.`;
    }
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if (!["system", "user", "assistant"].includes(role as string)) {
      return `messages[${i}].role must be "system", "user", or "assistant".`;
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return `messages[${i}].content must be a non-empty string.`;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return `messages[${i}].content exceeds ${MAX_CONTENT_LENGTH} chars.`;
    }
  }

  return null;
}

export async function handleChat(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    log("NO_KEY");
    endSSE(res, "error", { message: "Server not configured (missing DEEPSEEK_API_KEY)." });
    return;
  }

  const validationError = validateRequest(req.body);
  if (validationError) {
    log("VALIDATION_ERR: " + validationError);
    endSSE(res, "error", { message: validationError });
    return;
  }

  const { messages } = req.body as { messages: ChatMessage[] };
  log("START messages=" + messages.length + " model=" + MODEL);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const controller = new AbortController();

  // Express 5: req "close" fires when the request body stream ends (after
  // express.json() reads it), not when the client disconnects. Use res.on("close")
  // for actual client-disconnect detection during SSE streaming.
  res.on("close", () => {
    if (!res.writableEnded) {
      log("CLIENT_CLOSE");
      controller.abort();
    }
  });

  try {
    log("FETCH_START");
    const upstreamResp = await fetch(
      `${DEEPSEEK_BASE}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          stream: true,
          max_tokens: MAX_TOKENS,
        }),
        signal: controller.signal,
      },
    );
    log("FETCH_OK status=" + upstreamResp.status);

    if (!upstreamResp.ok) {
      const errorText = await upstreamResp.text().catch(() => "Unknown error");
      log("UPSTREAM_ERR: " + errorText);
      endSSE(res, "error", {
        message: `DeepSeek API error (${upstreamResp.status}): ${errorText}`,
      });
      return;
    }

    const reader = upstreamResp.body?.getReader();
    if (!reader) {
      log("NO_READER");
      endSSE(res, "error", { message: "Empty response from DeepSeek API." });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let tokenCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            tokenCount++;
            sendSSE(res, "token", { content: delta.content });
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    log("STREAM_DONE tokens=" + tokenCount);
    sendSSE(res, "done", { finished: true });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      log("ABORT");
      return;
    }
    if (err instanceof Error && err.name === "AbortError") {
      log("ABORT");
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    log("CATCH: " + message);
    if (!res.writableEnded) {
      endSSE(res, "error", { message });
      return;
    }
    log("CATCH: writableEnded=true");
  } finally {
    log("FINALLY writableEnded=" + res.writableEnded);
    if (!res.writableEnded) {
      res.end();
    }
  }
}
