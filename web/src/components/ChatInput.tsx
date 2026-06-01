import { useState, useRef, useCallback } from "react";

export function ChatInput({
  onSend,
  onStop,
  streaming,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    textareaRef.current?.focus();
  }, [input, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (streaming) {
        onStop();
      } else {
        handleSend();
      }
    }
  };

  return (
    <div className="chat-input-area">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
        rows={1}
        disabled={streaming}
      />
      <div className="chat-input-buttons">
        {streaming ? (
          <button className="btn-stop" onClick={onStop}>
            ⏹ Stop
          </button>
        ) : (
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            ▶ Send
          </button>
        )}
      </div>
    </div>
  );
}
