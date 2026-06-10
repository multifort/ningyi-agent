import { create } from "zustand";
import { Message, ToolCall } from "../api/conversations";

interface ChatStore {
  messages: Message[];
  streaming: boolean;
  activeConversationId: string | null;
  mode: "chat" | "agent";

  setConversation: (id: string | null) => void;
  finalizeMessage: (tempId: string, realId: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (msg: Message) => void;
  appendToken: (id: string, token: string) => void;
  appendReasoning: (id: string, token: string) => void;
  toolStart: (id: string, stepId: number, toolName: string, input: string) => void;
  toolEnd: (id: string, stepId: number, output: string, durationMs: number | null) => void;
  setStreaming: (v: boolean) => void;
  setMode: (mode: "chat" | "agent") => void;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  streaming: false,
  activeConversationId: null,
  mode: "chat",

  setConversation: (id) => set({ activeConversationId: id, messages: [] }),
  finalizeMessage: (tempId, realId) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === tempId ? { ...m, id: realId } : m)),
    })),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToken: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m,
      ),
    })),

  appendReasoning: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, reasoning: (m.reasoning ?? "") + token } : m,
      ),
    })),

  toolStart: (id, stepId, toolName, input) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id) return m;
        const tc: ToolCall = { stepId, toolName, input, status: "running" };
        return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
      }),
    })),

  toolEnd: (id, stepId, output, durationMs) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          toolCalls: (m.toolCalls ?? []).map((tc) =>
            tc.stepId === stepId
              ? { ...tc, output, durationMs, status: "done" as const }
              : tc,
          ),
        };
      }),
    })),

  setStreaming: (v) => set({ streaming: v }),
  setMode: (mode) => set({ mode }),
  reset: () => set({ messages: [], streaming: false }),
}));
