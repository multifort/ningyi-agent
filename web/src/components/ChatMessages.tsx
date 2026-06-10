import { useRef, useEffect, useState, useId, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import type { Message } from "../types";
import { ToolCallList } from "./ToolCallCard";
import logoImg from "/logo.png";

mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { darkMode: true, background: "#1c1c1f", primaryColor: "#5b7cff" } });

/* ── Mermaid diagram block ───────────────────── */

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  // useId is render-pure and stable; strip ':' so it's a valid mermaid/DOM id.
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    mermaid.render(id, code).then(({ svg: s }) => setSvg(s)).catch(() => setSvg("<p style='color:#f87171'>图表渲染失败</p>"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return <div ref={ref} className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* ── Code block with copy button ──────────────── */

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeText = typeof children === "string" ? children : "";
  const language = className?.replace("language-", "") || "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (language === "mermaid") {
    return <MermaidBlock code={codeText} />;
  }

  return (
    <div className="code-block-wrapper">
      {language && <span className="code-lang">{language}</span>}
      <button className="code-copy-btn" onClick={handleCopy}>
        {copied ? "✓ 已复制" : "📋 复制"}
      </button>
      <pre className={className}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/* ── Chat Message ─────────────────────────────── */

function ChatMessage({
  message,
  onEdit,
  onRegenerateMsg,
  streaming,
  userAvatar,
}: {
  message: Message;
  onEdit?: (text: string) => void;
  onRegenerateMsg?: (messageId: string) => void;
  streaming: boolean;
  userAvatar: string | null;
}) {
  const isUser = message.role === "user";
  const isEmpty = message.content.trim().length === 0;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar">
        {isUser ? (
          userAvatar ? (
            <img className="msg-avatar-img" src={userAvatar} alt="用户" />
          ) : (
            "👤"
          )
        ) : (
          <img className="msg-avatar-img" src={logoImg} alt="AI" />
        )}
      </div>
      <div className="msg-body">
        <div className="msg-content">
          {!isUser && message.reasoning && (
            <details className="reasoning-block">
              <summary className="reasoning-summary">💭 思考过程</summary>
              <div className="reasoning-content">{message.reasoning}</div>
            </details>
          )}
          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallList tools={message.toolCalls} />
          )}
          {isUser ? (
            <p>{message.content}</p>
          ) : isEmpty ? (
            streaming ? (
              <span className="msg-typing">正在思考…</span>
            ) : !message.toolCalls || message.toolCalls.length === 0 ? (
              <span className="msg-stopped">已停止生成</span>
            ) : null
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {!isEmpty && (
          <div className="msg-actions">
            <button
              className={`msg-action-icon${copied ? " is-active" : ""}`}
              onClick={handleCopy}
              title="复制"
            >
              {copied ? "✓" : "⎘"}
            </button>
            {isUser ? (
              <button
                className="msg-action-icon"
                onClick={() => onEdit?.(message.content)}
                title="编辑"
              >
                ✎
              </button>
            ) : (
              <button
                className="msg-action-icon"
                onClick={() => onRegenerateMsg?.(message.id)}
                disabled={streaming}
                title="重新生成"
              >
                ↻
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Chat Messages Container ──────────────────── */

export function ChatMessages({
  messages,
  streaming,
  onEditMessage,
  onRegenerateMessage,
  userAvatar,
  onClearChat,
  onForkChat,
}: {
  messages: Message[];
  streaming: boolean;
  onEditMessage: (text: string) => void;
  onRegenerateMessage: (messageId: string) => void;
  userAvatar: string | null;
  onClearChat: () => void;
  onForkChat: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.length > 0 && (
        <div className="chat-title-bar">
          <button className="btn-regenerate" onClick={onForkChat}>⑂ 分叉</button>
          <button className="btn-regenerate" onClick={onClearChat}>🗑 清空</button>
        </div>
      )}
      {messages.map((m, i) => (
        <ChatMessage
          key={m.id}
          message={m}
          onEdit={onEditMessage}
          onRegenerateMsg={onRegenerateMessage}
          // Only the last message is the one actively streaming.
          streaming={streaming && i === messages.length - 1}
          userAvatar={userAvatar}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
