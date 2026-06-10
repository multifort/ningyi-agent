import { fetch } from "expo/fetch";
import { getToken } from "../api/client";
import { useSettingsStore } from "../stores/settingsStore";

export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_start"; stepId: number; toolName: string; input: string }
  | { type: "tool_end"; stepId: number; output: string; durationMs: number | null }
  | { type: "citations"; citations: string[] }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; message: string };

export interface ChatStreamOptions {
  conversationId?: string;
  messages: Array<{ role: string; content: string }>;
  mode?: "chat" | "agent";
  search?: boolean;
  onEvent: (event: SSEEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const { conversationId, messages, mode = "chat", search = false, onEvent, signal } = options;

  const baseURL = useSettingsStore.getState().baseURL;
  const token = await getToken();

  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ conversationId, messages, mode, search }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const payload = JSON.parse(data);
          onEvent({ type: currentEvent, ...payload } as SSEEvent);
        } catch {}
      }
    }
  }
}
