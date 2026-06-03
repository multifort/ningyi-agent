/**
 * Memory extraction — uses a lightweight DeepSeek call to pull durable
 * facts (preferences, identity, decisions) from a finished conversation turn.
 *
 * Best-effort: failures are swallowed so they never disrupt the chat.
 */

import { saveExtractedMemories } from "./memory.js";

const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const EXTRACT_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const SYSTEM = `你是一个记忆提取助手。从用户与AI的最近一轮对话中，提取值得长期记住的、关于"用户本人"的稳定事实（偏好、身份、长期目标、重要决定）。
规则：
- 只提取关于用户的稳定信息，忽略一次性的临时请求。
- 每条 key 用简短英文或拼音标识（如 "language_preference"），content 用中文一句话。
- 如果没有值得记住的内容，返回空数组。
- 严格只输出 JSON 数组，形如：[{"key":"...","content":"..."}]，不要任何额外文字。`;

export async function extractAndSaveMemories(
  userId: number,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  if (process.env.AGENT_MEMORY_EXTRACTION === "false") return;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return;

  try {
    const resp = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `用户：${userMessage}\n\nAI：${assistantMessage}`.slice(0, 6000),
          },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";

    // Extract JSON array even if wrapped in markdown fences
    const match = /\[[\s\S]*\]/.exec(raw);
    if (!match) return;

    const facts = JSON.parse(match[0]) as Array<{ key: string; content: string }>;
    if (Array.isArray(facts) && facts.length > 0) {
      saveExtractedMemories(userId, facts.slice(0, 10));
    }
  } catch {
    // Silent — extraction is non-critical
  }
}
