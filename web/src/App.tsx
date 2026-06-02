import {
  useReducer,
  useRef,
  useCallback,
  useState,
  useEffect,
} from "react";
import { ChatMessages } from "./components/ChatMessages";
import { ChatInput } from "./components/ChatInput";
import { Sidebar } from "./components/Sidebar";
import { Settings } from "./components/Settings";
import type { SettingsData } from "./components/Settings";
import { LoginPage, RegisterPage } from "./components/AuthPages";
import { useAuth, fetchApi } from "./components/AuthProvider";
import {
  chatReducer,
  getActiveMessages,
} from "./types";
import type { Message } from "./types";
import logoImg from "/logo.png";
import "./App.css";

let nextMsgId = 1;
function genMsgId(): string {
  return `msg-${Date.now()}-${nextMsgId++}`;
}

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem("user-settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { avatar: null, displayName: "multifort", systemPrompt: "", apiKey: "", fontSize: 16 };
}

function saveSettings(data: SettingsData) {
  localStorage.setItem("user-settings", JSON.stringify(data));
}

export default function App() {
  const { user, token, loading: authLoading, logout } = useAuth();
  const [authPage, setAuthPage] = useState<"login" | "register">("login");

  const [state, dispatch] = useReducer(chatReducer, {
    conversations: [],
    activeConversationId: null,
    streaming: false,
    error: null,
    sidebarCollapsed: false,
  });

  const [editText, setEditText] = useState("");
  const [userSettings, setUserSettings] =
    useState<SettingsData>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [agentMode, setAgentMode] = useState<boolean>(() => {
    try { return localStorage.getItem("agent-mode") === "true"; } catch { return false; }
  });
  const handleToggleAgentMode = useCallback(() => {
    setAgentMode((prev) => {
      const next = !prev;
      localStorage.setItem("agent-mode", String(next));
      return next;
    });
  }, []);

  const activeId = state.activeConversationId;
  const messages = getActiveMessages(state);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations from API on login
  useEffect(() => {
    if (!user || !token) return;
    fetchApi("/conversations", {}, token)
      .then((data) => {
        dispatch({
          type: "LOAD_CONVERSATIONS",
          conversations: data.conversations,
        });
      })
      .catch(() => {});
  }, [user, token]);

  // Load messages when switching conversations
  useEffect(() => {
    if (!activeId || !token) return;
    fetchApi(`/conversations/${activeId}/messages`, {}, token)
      .then((data) => {
        dispatch({
          type: "LOAD_MESSAGES",
          conversationId: activeId,
          messages: data.messages.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as Message["role"],
            content: m.content as string,
          })),
        });
      })
      .catch(() => {});
  }, [activeId, token]);

  const doStream = useCallback(
    (apiMessages: { role: string; content: string }[], convId?: string) => {
      const assistantMsg: Message = {
        id: genMsgId(),
        role: "assistant",
        content: "",
      };
      dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
      dispatch({ type: "SET_ERROR", error: null });
      dispatch({ type: "SET_STREAMING", streaming: true });

      abortRef.current = streamChatAuth(
        apiMessages, convId, "deepseek-chat", token!,
        {
          onToken: (t) => dispatch({ type: "APPEND_TOKEN", messageId: assistantMsg.id, token: t }),
          onReasoning: (t) => dispatch({ type: "APPEND_REASONING", messageId: assistantMsg.id, token: t }),
          onDone: (newConvId) => {
            dispatch({ type: "SET_STREAMING", streaming: false });
            if (document.visibilityState === "hidden" && Notification.permission === "granted") {
              new Notification("宁翼智能助手", { body: "回复已完成", icon: "/logo.png" });
            }
            if (newConvId && !activeId) {
              dispatch({ type: "SET_ACTIVE_CONVERSATION", id: newConvId });
              fetchApi("/conversations", {}, token!).then((data) =>
                dispatch({ type: "LOAD_CONVERSATIONS", conversations: data.conversations })
              ).catch(() => {});
            }
          },
          onError: (message) => dispatch({ type: "SET_ERROR", error: message }),
        },
        agentMode,
      );
    },
    [activeId, token, agentMode],
  );

  const sendMessage = useCallback(
    (text: string, fileContent?: string) => {
      if (!token) return;
      const userMsg: Message = {
        id: genMsgId(),
        role: "user",
        content: text,
      };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      setEditText("");

      const existing = messages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      // Build API messages with optional file context
      const apiMsgs = [...existing];
      if (fileContent) {
        apiMsgs.unshift({ role: "system" as const, content: fileContent });
      }
      apiMsgs.push({ role: "user" as const, content: text });

      doStream(apiMsgs, activeId ?? undefined);
    },
    [activeId, messages, doStream, token],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_STREAMING", streaming: false });
  }, []);

  const handleEditMessage = useCallback((text: string) => {
    setEditText(text);
  }, []);

  const handleRegenerateMessage = useCallback(
    (messageId: string) => {
      if (state.streaming) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1 || messages[idx].role !== "assistant") return;

      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userIdx = i;
          break;
        }
      }
      if (userIdx === -1) return;

      const apiMessages = messages
        .slice(0, idx)
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      doStream(apiMessages, activeId ?? undefined);
    },
    [activeId, messages, state.streaming, doStream],
  );

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "NEW_CONVERSATION" });
    setEditText("");
  }, []);

  const handleSelectConv = useCallback((id: string) => {
    abortRef.current?.abort();
    dispatch({ type: "SELECT_CONVERSATION", id });
    setEditText("");
  }, []);

  const handleDeleteConv = useCallback(
    (id: string) => {
      if (!token) return;
      fetchApi(`/conversations/${id}`, { method: "DELETE" }, token)
        .then(() => dispatch({ type: "DELETE_CONVERSATION", id }))
        .catch(() => {});
    },
    [token],
  );

  const handleClearChat = useCallback(() => {
    if (!activeId || !token) return;
    fetchApi(`/conversations/${activeId}`, { method: "DELETE" }, token)
      .then(() => dispatch({ type: "DELETE_CONVERSATION", id: activeId }))
      .catch(() => {});
  }, [activeId, token]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewChat]);

  // Request notification permission on first click
  useEffect(() => {
    const request = () => {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
      document.removeEventListener("click", request);
    };
    document.addEventListener("click", request);
    return () => document.removeEventListener("click", request);
  }, []);

  const hasMessages = messages.length > 0;
  const canContinue = !state.streaming && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  const handleContinue = useCallback(() => {
    const existing = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    doStream(existing, activeId ?? undefined);
  }, [activeId, messages, doStream]);

  const handleForkChat = useCallback(() => {
    if (!activeId) return;
    dispatch({ type: "FORK_CONVERSATION", conversationId: activeId });
  }, [activeId]);

  // Auth loading
  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ color: "var(--text-muted)" }}>加载中…</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return authPage === "login" ? (
      <LoginPage onSwitchRegister={() => setAuthPage("register")} />
    ) : (
      <RegisterPage onSwitchLogin={() => setAuthPage("login")} />
    );
  }

  // Logged in — main app
  return (
    <div className="app">
      <Sidebar
        conversations={state.conversations}
        activeId={activeId}
        onNewChat={handleNewChat}
        onSelectConv={handleSelectConv}
        onDeleteConv={handleDeleteConv}
        onToggleArchive={(id) => dispatch({ type: "TOGGLE_ARCHIVE", id })}
        onRename={(id, title) => { fetchApi(`/conversations/${id}`, { method: "PUT", body: JSON.stringify({ title }) }, token!).catch(() => {}); }}
        onShare={async (id) => { try { const r = await fetchApi(`/conversations/${id}/share`, { method: "POST" }, token!); await navigator.clipboard.writeText(window.location.origin + r.url); alert("分享链接已复制到剪贴板！"); } catch { alert("分享失败"); }}}
        collapsed={state.sidebarCollapsed}
        onToggle={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        userAvatar={user.avatar || userSettings.avatar}
        userDisplayName={user.displayName}
        onSettingsClick={() => setSettingsOpen(true)}
        onLogout={logout}
      />

      <main className="main-area">
        {!hasMessages && !state.streaming ? (
          <div className="welcome">
            <img className="welcome-logo" src={logoImg} alt="宁翼智能助手" />
            <h1 className="welcome-title">宁翼智能助手</h1>
            <p className="welcome-subtitle">
              您的智能生活管家，随时为您服务
            </p>
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            streaming={state.streaming}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
            userAvatar={user.avatar || userSettings.avatar}
            onClearChat={handleClearChat}
            onForkChat={handleForkChat}
          />
        )}

        {state.error && (
          <div className="chat-error">⚠️ {state.error}</div>
        )}

        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          streaming={state.streaming}
          editText={editText}
          onEditConsumed={() => setEditText("")}
          searchEnabled={searchEnabled}
          onToggleSearch={() => setSearchEnabled(!searchEnabled)}
          canContinue={canContinue}
          onContinue={handleContinue}
          agentMode={agentMode}
          onToggleAgentMode={handleToggleAgentMode}
        />
      </main>

      {settingsOpen && (
        <Settings
          settings={{
            avatar: userSettings.avatar,
            displayName: user.displayName,
            systemPrompt: user.systemPrompt,
            apiKey: userSettings.apiKey,
            fontSize: userSettings.fontSize || 16,
          }}
          onSave={(data) => {
            setUserSettings(data);
            saveSettings(data);
            if (token) {
              fetchApi(
                "/auth/profile",
                {
                  method: "PUT",
                  body: JSON.stringify({
                    displayName: data.displayName,
                    avatar: data.avatar,
                    systemPrompt: data.systemPrompt,
                    apiKey: data.apiKey || null,
                  }),
                },
                token,
              ).catch(() => {});
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * SSE chat with auth token.
 */
function streamChatAuth(
  messages: { role: string; content: string }[],
  conversationId: string | undefined,
  _model: string,
  token: string,
  callbacks: {
    onToken: (content: string) => void;
    onReasoning?: (content: string) => void;
    onDone: (conversationId?: string) => void;
    onError: (message: string) => void;
  },
  agentMode = false,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const body: Record<string, unknown> = { messages, model: "deepseek-chat" };
      if (conversationId) body.conversationId = conversationId;
      if (agentMode) body.mode = "agent";

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "reasoning") {
              callbacks.onReasoning?.(data.content);
            } else if (eventType === "thinking") {
              // Agent mode: Hermes is working — onReasoning used to show spinner text
              callbacks.onReasoning?.("⚡ Hermes Agent 正在思考…");
            } else if (data.content) {
              callbacks.onToken(data.content);
            } else if (data.finished !== undefined) {
              callbacks.onDone(data.conversationId);
            } else if (data.message) {
              callbacks.onError(data.message);
            }
            eventType = "";
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      )
        return;
      callbacks.onError(
        err instanceof Error ? err.message : "Stream error",
      );
    }
  })();

  return controller;
}
