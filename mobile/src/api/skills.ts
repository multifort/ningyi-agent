import { api, getToken } from "./client";
import { useSettingsStore } from "../stores/settingsStore";
import { SSEEvent } from "../lib/sse";

export interface Skill {
  name: string;
  description?: string;
  path?: string;
}

export interface SkillInvocation {
  id: string;
  skillName: string;
  input: string;
  status: "running" | "done" | "error";
  createdAt: string;
}

export async function listSkills(): Promise<Skill[]> {
  const res = await api.get<{ skills: Skill[] }>("/api/skills");
  return res.skills ?? [];
}

export async function listSkillHistory(): Promise<SkillInvocation[]> {
  const res = await api.get<{ invocations: SkillInvocation[] }>("/api/skills/history");
  return res.invocations ?? [];
}

export interface InvokeOptions {
  skillName: string;
  input: string;
  conversationId?: string;
  onEvent: (event: SSEEvent) => void;
  signal?: AbortSignal;
}

export async function invokeSkill(options: InvokeOptions): Promise<void> {
  const { skillName, input, conversationId, onEvent, signal } = options;
  const baseURL = useSettingsStore.getState().baseURL;
  const token = await getToken();

  const response = await fetch(`${baseURL}/api/skills/${encodeURIComponent(skillName)}/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ input, conversationId }),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
