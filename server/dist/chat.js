import { randomUUID } from "node:crypto";
import db from "./db.js";
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const MAX_TOKENS = 4096;
const MAX_MESSAGES = 200;
const MAX_CONTENT_LENGTH = 32000;
// ── SSE helpers ──────────────────────────────────
function formatSSE(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
function sendSSE(res, event, data) {
    res.write(formatSSE(event, data));
}
function endSSE(res, event, data) {
    res.end(formatSSE(event, data));
}
// ── Validation ───────────────────────────────────
export function validateRequest(body) {
    if (!body || typeof body !== "object")
        return "Request body must be a JSON object.";
    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0)
        return "`messages` must be a non-empty array.";
    if (messages.length > MAX_MESSAGES)
        return `Too many messages (max ${MAX_MESSAGES}).`;
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (!m || typeof m !== "object")
            return `messages[${i}] must be an object.`;
        const role = m.role;
        const content = m.content;
        if (!["system", "user", "assistant"].includes(role))
            return `messages[${i}].role must be "system", "user", or "assistant".`;
        if (typeof content !== "string" || content.trim().length === 0)
            return `messages[${i}].content must be a non-empty string.`;
        if (content.length > MAX_CONTENT_LENGTH)
            return `messages[${i}].content exceeds ${MAX_CONTENT_LENGTH} chars.`;
    }
    return null;
}
// ── Main handler ─────────────────────────────────
export async function handleChat(req, res) {
    const userId = req.userId;
    // Determine API key: user's own key first, then global env key
    const user = db.prepare("SELECT system_prompt, api_key FROM users WHERE id = ?").get(userId);
    const apiKey = user?.api_key || process.env.DEEPSEEK_API_KEY;
    const systemPrompt = user?.system_prompt || "你是宁翼智能助手，一个热情、专业的AI助手。用中文回复。";
    if (!apiKey) {
        endSSE(res, "error", { message: "未配置 API Key，请在设置中配置。" });
        return;
    }
    const validationError = validateRequest(req.body);
    if (validationError) {
        endSSE(res, "error", { message: validationError });
        return;
    }
    let { conversationId } = req.body;
    const { messages } = req.body;
    // Ensure conversation exists
    if (conversationId) {
        const conv = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").get(conversationId, userId);
        if (!conv)
            conversationId = undefined;
    }
    if (!conversationId) {
        conversationId = randomUUID();
        db.prepare("INSERT INTO conversations (id, user_id) VALUES (?, ?)").run(conversationId, userId);
    }
    // Save user message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
        db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)").run(randomUUID(), conversationId, "user", lastMsg.content);
        // Update conversation timestamp
        db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
        // Auto-title from first user message
        const conv = db.prepare("SELECT title FROM conversations WHERE id = ?").get(conversationId);
        if (conv?.title === "新对话") {
            const t = lastMsg.content.slice(0, 30) + (lastMsg.content.length > 30 ? "…" : "");
            db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(t, conversationId);
        }
    }
    // Build API messages with system prompt
    const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system"),
    ];
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    const controller = new AbortController();
    // Express 5: res close = actual client disconnect
    res.on("close", () => {
        if (!res.writableEnded)
            controller.abort();
    });
    try {
        const model = req.body.model ?? DEFAULT_MODEL;
        const upstreamResp = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: apiMessages,
                stream: true,
                max_tokens: MAX_TOKENS,
            }),
            signal: controller.signal,
        });
        if (!upstreamResp.ok) {
            const errorText = await upstreamResp.text().catch(() => "Unknown error");
            endSSE(res, "error", { message: `API 错误 (${upstreamResp.status}): ${errorText}` });
            return;
        }
        const reader = upstreamResp.body?.getReader();
        if (!reader) {
            endSSE(res, "error", { message: "Empty response from API." });
            return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let tokenCount = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:"))
                    continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === "[DONE]")
                    continue;
                try {
                    const chunk = JSON.parse(jsonStr);
                    const delta = chunk.choices?.[0]?.delta;
                    if (delta?.reasoning_content) {
                        sendSSE(res, "reasoning", { content: delta.reasoning_content });
                    }
                    if (delta?.content) {
                        tokenCount++;
                        fullContent += delta.content;
                        sendSSE(res, "token", { content: delta.content });
                    }
                }
                catch { /* skip */ }
            }
        }
        // Save assistant message
        if (fullContent) {
            db.prepare("INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), conversationId, "assistant", fullContent, tokenCount);
            db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
        }
        sendSSE(res, "done", { conversationId, finished: true });
    }
    catch (err) {
        if (err instanceof Error && (err.name === "AbortError" || err.name === "AbortError"))
            return;
        const message = err instanceof Error ? err.message : "Unknown error";
        if (!res.writableEnded) {
            endSSE(res, "error", { message });
            return;
        }
    }
    finally {
        if (!res.writableEnded)
            res.end();
    }
}
//# sourceMappingURL=chat.js.map