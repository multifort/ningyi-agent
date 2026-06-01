import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../types";

function CopyButton({ text }: { text: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(text);
  };
  return (
    <button className="msg-copy" onClick={copy} title="Copy">
      📋
    </button>
  );
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isEmpty = message.content.trim().length === 0;

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-role">{isUser ? "You" : "AI"}</div>
      <div className="msg-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : isEmpty ? (
          <span className="msg-typing">Thinking…</span>
        ) : (
          <ReactMarkdown>{message.content}</ReactMarkdown>
        )}
      </div>
      {!isUser && !isEmpty && <CopyButton text={message.content} />}
    </div>
  );
}

export function ChatMessages({
  messages,
}: {
  messages: Message[];
  streaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <div className="chat-empty">
          Send a message to start the conversation.
        </div>
      )}
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
