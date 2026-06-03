export interface ToolCall {
  stepId: number;
  toolName: string;
  input: string;
  output?: string;
  durationMs?: number | null;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  streaming: boolean;
  error: string | null;
  sidebarCollapsed: boolean;
}

export type ChatAction =
  | { type: "NEW_CONVERSATION" }
  | { type: "SELECT_CONVERSATION"; id: string }
  | { type: "SET_ACTIVE_CONVERSATION"; id: string }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "LOAD_CONVERSATIONS"; conversations: unknown[] }
  | {
      type: "LOAD_MESSAGES";
      conversationId: string;
      messages: Message[];
    }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "APPEND_TOKEN"; messageId: string; token: string }
  | { type: "APPEND_REASONING"; messageId: string; token: string }
  | { type: "TOOL_START"; messageId: string; stepId: number; toolName: string; input: string }
  | { type: "TOOL_END"; messageId: string; stepId: number; output?: string; durationMs?: number | null }
  | { type: "SET_STREAMING"; streaming: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_ARCHIVE"; id: string }
  | { type: "FORK_CONVERSATION"; conversationId: string }
  | { type: "ADD_CITATION"; citations: string[] };

let convCounter = 1;
function genConvId(): string {
  return `conv-${Date.now()}-${convCounter++}`;
}

export function createConversation(): Conversation {
  return {
    id: genConvId(),
    title: "新对话",
    messages: [],
    archived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function getActive(state: ChatState): Conversation | undefined {
  return state.conversations.find(
    (c) => c.id === state.activeConversationId,
  );
}

export function chatReducer(
  state: ChatState,
  action: ChatAction,
): ChatState {
  switch (action.type) {
    case "NEW_CONVERSATION": {
      const conv = createConversation();
      return {
        ...state,
        conversations: [conv, ...state.conversations],
        activeConversationId: conv.id,
        error: null,
      };
    }
    case "SELECT_CONVERSATION":
      return {
        ...state,
        activeConversationId: action.id,
        error: null,
      };
    case "SET_ACTIVE_CONVERSATION":
      return {
        ...state,
        activeConversationId: action.id,
      };
    case "DELETE_CONVERSATION": {
      const filtered = state.conversations.filter(
        (c) => c.id !== action.id,
      );
      let nextActive = state.activeConversationId;
      if (action.id === state.activeConversationId) {
        nextActive = filtered.length > 0 ? filtered[0].id : null;
      }
      return {
        ...state,
        conversations: filtered,
        activeConversationId: nextActive,
        error: null,
      };
    }
    case "LOAD_CONVERSATIONS": {
      // Map API conversations to our Conversation type
      const raw = action.conversations as unknown as Array<{
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
      }>;
      const mapped: Conversation[] = raw.map((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        archived: false,
        createdAt: new Date(c.createdAt).getTime(),
        updatedAt: new Date(c.updatedAt).getTime(),
      }));
      const activeId =
        state.activeConversationId &&
        mapped.find((c) => c.id === state.activeConversationId)
          ? state.activeConversationId
          : mapped.length > 0
            ? mapped[0].id
            : null;
      return {
        ...state,
        conversations: mapped,
        activeConversationId: activeId,
      };
    }
    case "LOAD_MESSAGES": {
      const convs = state.conversations.map((c) => {
        if (c.id !== action.conversationId) return c;
        return { ...c, messages: action.messages };
      });
      return { ...state, conversations: convs };
    }
    case "ADD_MESSAGE": {
      const convs = state.conversations.map((c) => {
        if (c.id !== state.activeConversationId) return c;
        const updated = {
          ...c,
          messages: [...c.messages, action.message],
          updatedAt: Date.now(),
        };
        // Auto-title from first user message
        if (
          action.message.role === "user" &&
          c.title === "新对话"
        ) {
          updated.title =
            action.message.content.slice(0, 30) +
            (action.message.content.length > 30 ? "…" : "");
        }
        return updated;
      });
      return { ...state, conversations: convs };
    }
    case "APPEND_TOKEN": {
      const convs = state.conversations.map((c) => {
        if (c.id !== state.activeConversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === action.messageId
              ? { ...m, content: m.content + action.token }
              : m,
          ),
          updatedAt: Date.now(),
        };
      });
      return { ...state, conversations: convs };
    }
    case "APPEND_REASONING": {
      const convs = state.conversations.map((c) => {
        if (c.id !== state.activeConversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === action.messageId
              ? { ...m, reasoning: (m.reasoning || "") + action.token }
              : m,
          ),
          updatedAt: Date.now(),
        };
      });
      return { ...state, conversations: convs };
    }
    case "TOOL_START": {
      const convs = state.conversations.map((c) => {
        if (c.id !== state.activeConversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== action.messageId) return m;
            const tc: ToolCall = {
              stepId: action.stepId,
              toolName: action.toolName,
              input: action.input,
              status: "running",
            };
            return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
          }),
        };
      });
      return { ...state, conversations: convs };
    }
    case "TOOL_END": {
      const convs = state.conversations.map((c) => {
        if (c.id !== state.activeConversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== action.messageId) return m;
            return {
              ...m,
              toolCalls: (m.toolCalls ?? []).map((t) =>
                t.stepId === action.stepId
                  ? { ...t, status: "done" as const, output: action.output, durationMs: action.durationMs }
                  : t,
              ),
            };
          }),
        };
      });
      return { ...state, conversations: convs };
    }
    case "SET_STREAMING":
      return { ...state, streaming: action.streaming };
    case "SET_ERROR":
      return { ...state, error: action.error, streaming: false };
    case "TOGGLE_SIDEBAR":
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed,
      };
    case "TOGGLE_ARCHIVE": {
      const convs = state.conversations.map((c) =>
        c.id === action.id ? { ...c, archived: !c.archived } : c,
      );
      return { ...state, conversations: convs };
    }
    case "FORK_CONVERSATION": {
      const src = state.conversations.find(c => c.id === action.conversationId);
      if (!src) return state;
      const fork: Conversation = {
        ...createConversation(),
        title: src.title + " (分支)",
        messages: [...src.messages],
      };
      return {
        ...state,
        conversations: [fork, ...state.conversations],
        activeConversationId: fork.id,
      };
    }
    case "ADD_CITATION":
      // citations stored on latest assistant message (handled in App.tsx)
      return state;
  }
}

export function getActiveMessages(state: ChatState): Message[] {
  return getActive(state)?.messages ?? [];
}

export function getActiveTitle(state: ChatState): string {
  return getActive(state)?.title ?? "新对话";
}
