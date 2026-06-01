/**
 * SSE chat API — streams tokens from /api/chat.
 * Returns an AbortController so the caller can cancel.
 */

interface SSEChatCallbacks {
  onToken: (content: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
}

export function streamChat(
  messages: ChatRequest["messages"],
  callbacks: SSEChatCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // Store event type for next data line
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              // We don't need to match event: lines — the data content
              // tells us what happened
              if ("finished" in data && data.finished === true) {
                callbacks.onDone();
              } else if ("message" in data) {
                callbacks.onError(data.message);
              } else if ("content" in data) {
                callbacks.onToken(data.content);
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — silent
        return;
      }
      callbacks.onError(err instanceof Error ? err.message : "Stream error");
    }
  })();

  return controller;
}
