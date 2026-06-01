export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatState {
  messages: Message[];
  streaming: boolean;
  error: string | null;
}

export type ChatAction =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "APPEND_TOKEN"; messageId: string; token: string }
  | { type: "SET_STREAMING"; streaming: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "CLEAR_MESSAGES" }
  | { type: "REMOVE_LAST_ASSISTANT" };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "APPEND_TOKEN":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId
            ? { ...m, content: m.content + action.token }
            : m,
        ),
      };
    case "SET_STREAMING":
      return { ...state, streaming: action.streaming };
    case "SET_ERROR":
      return { ...state, error: action.error, streaming: false };
    case "CLEAR_MESSAGES":
      return { ...state, messages: [], error: null };
    case "REMOVE_LAST_ASSISTANT":
      return {
        ...state,
        messages: state.messages.length > 0 &&
          state.messages[state.messages.length - 1].role === "assistant"
          ? state.messages.slice(0, -1)
          : state.messages,
      };
  }
}
