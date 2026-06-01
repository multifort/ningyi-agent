import { useReducer, useRef, useCallback } from "react";
import { ChatMessages } from "./components/ChatMessages";
import { ChatInput } from "./components/ChatInput";
import { chatReducer } from "./types";
import { streamChat } from "./api";
import type { Message } from "./types";
import "./App.css";

let nextId = 1;
function genId(): string {
  return `msg-${nextId++}`;
}

export default function App() {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: [],
    streaming: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    (text: string) => {
      const userMsg: Message = {
        id: genId(),
        role: "user",
        content: text,
      };
      const assistantMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "",
      };

      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
      dispatch({ type: "SET_ERROR", error: null });
      dispatch({ type: "SET_STREAMING", streaming: true });

      // Filter out placeholder messages with empty content (e.g. the assistant
      // placeholder we just added) before sending to the API.
      const allMessages = [
        ...state.messages
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];

      abortRef.current = streamChat(allMessages, {
        onToken: (token) => {
          dispatch({
            type: "APPEND_TOKEN",
            messageId: assistantMsg.id,
            token,
          });
        },
        onDone: () => {
          dispatch({ type: "SET_STREAMING", streaming: false });
        },
        onError: (message) => {
          dispatch({ type: "SET_ERROR", error: message });
        },
      });
    },
    [state.messages],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_STREAMING", streaming: false });
  }, []);

  const regenerate = useCallback(() => {
    if (state.messages.length < 2) return;
    dispatch({ type: "REMOVE_LAST_ASSISTANT" });
    // After removing, send the last user message again
    const lastUser = [...state.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUser) {
      setTimeout(() => {
        const text = lastUser.content;
        // Manually remove last assistant + resend
        dispatch({ type: "REMOVE_LAST_ASSISTANT" });
        // Force the resend with the full message list excluding the old assistant reply
        const toSend: Message[] = [
          ...state.messages.filter(
            (m) => m.id !== state.messages[state.messages.length - 1]?.id,
          ),
        ];
        const userMsg: Message = {
          id: genId(),
          role: "user",
          content: text,
        };
        const assistantMsg: Message = {
          id: genId(),
          role: "assistant",
          content: "",
        };
        dispatch({ type: "ADD_MESSAGE", message: userMsg });
        dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
        dispatch({ type: "SET_ERROR", error: null });
        dispatch({ type: "SET_STREAMING", streaming: true });

        const apiMessages = [
          ...toSend
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: text },
        ];

        abortRef.current = streamChat(apiMessages, {
          onToken: (token) => {
            dispatch({
              type: "APPEND_TOKEN",
              messageId: assistantMsg.id,
              token,
            });
          },
          onDone: () => {
            dispatch({ type: "SET_STREAMING", streaming: false });
          },
          onError: (message) => {
            dispatch({ type: "SET_ERROR", error: message });
          },
        });
      }, 0);
    }
  }, [state.messages]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "CLEAR_MESSAGES" });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Hermes Chat</h1>
        <div className="header-actions">
          <button
            className="btn-header"
            onClick={regenerate}
            disabled={state.streaming || state.messages.length < 2}
            title="Regenerate last reply"
          >
            🔄 Regenerate
          </button>
          <button
            className="btn-header"
            onClick={clearChat}
            disabled={state.messages.length === 0}
            title="Clear conversation"
          >
            🗑 Clear
          </button>
        </div>
      </header>
      {state.error && (
        <div className="chat-error">
          Error: {state.error}
        </div>
      )}
      <ChatMessages messages={state.messages} streaming={state.streaming} />
      <ChatInput
        onSend={sendMessage}
        onStop={stopGeneration}
        streaming={state.streaming}
      />
    </div>
  );
}
