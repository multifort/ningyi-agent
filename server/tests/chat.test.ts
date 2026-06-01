/**
 * Tests for the /api/chat SSE proxy.
 *
 * Covers:
 *  - Input validation (validateRequest)
 *  - Missing API key
 *  - Successful streaming (mock fetch)
 *  - Client cancellation (abort)
 *  - Upstream error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { handleChat, validateRequest } from "../src/chat.js";

// ---------------------------------------------------------------------------
// Unit: validateRequest
// ---------------------------------------------------------------------------
describe("validateRequest", () => {
  it("rejects null / non-object", () => {
    expect(validateRequest(null)).toContain("must be a JSON object");
    expect(validateRequest(undefined)).toContain("must be a JSON object");
    expect(validateRequest("string")).toContain("must be a JSON object");
  });

  it("rejects missing or empty messages array", () => {
    expect(validateRequest({})).toContain("non-empty array");
    expect(validateRequest({ messages: [] })).toContain("non-empty array");
  });

  it("rejects too many messages", () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    expect(validateRequest({ messages })).toContain("Too many messages");
  });

  it("rejects invalid role", () => {
    expect(
      validateRequest({ messages: [{ role: "admin", content: "hi" }] }),
    ).toContain("system");
  });

  it("rejects empty content", () => {
    expect(
      validateRequest({ messages: [{ role: "user", content: "   " }] }),
    ).toContain("non-empty string");
    expect(
      validateRequest({ messages: [{ role: "user", content: "" }] }),
    ).toContain("non-empty string");
  });

  it("rejects overlong content", () => {
    const long = "a".repeat(8001);
    expect(
      validateRequest({ messages: [{ role: "user", content: long }] }),
    ).toContain("exceeds");
  });

  it("accepts valid messages", () => {
    expect(
      validateRequest({
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" },
          { role: "user", content: "How are you?" },
        ],
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: POST /api/chat
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.post("/api/chat", handleChat);
  return app;
}

describe("POST /api/chat", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns error SSE when API key is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const res = await request(buildApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(200); // SSE over HTTP 200
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("DEEPSEEK_API_KEY");
  });

  it("returns error SSE for invalid body", async () => {
    const res = await request(buildApp())
      .post("/api/chat")
      .send({ messages: [] });

    expect(res.text).toContain("event: error");
    expect(res.text).toContain("non-empty");
  });

  it("streams token events from a mocked DeepSeek response", async () => {
    // Mock fetch to return a SSE stream like DeepSeek's
    const mockStream = new ReadableStream({
      start(controller) {
        const chunks = [
          'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
          'data: {"id":"2","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
          'data: {"id":"3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ];
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(mockStream, {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const res = await request(buildApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain('event: token');
    expect(res.text).toContain('"content":"Hello"');
    expect(res.text).toContain('"content":" world"');
    expect(res.text).toContain("event: done");
  });

  it("handles upstream API error gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const res = await request(buildApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.text).toContain("event: error");
    expect(res.text).toContain("401");
  });

  it("handles network error from fetch", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(buildApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    // Should not crash; error should be surfaced
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("ECONNREFUSED");
  });

  it("aborts upstream fetch when client disconnects", async () => {
    // Test cancellation at the handler level — emit 'close' on the request
    // to simulate a client disconnecting mid-stream.
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init?.signal;
      return new Promise(() => {
        // Never resolve — wait for abort
      });
    });

    // Create mock req/res
    const events: Array<[string, (...args: unknown[]) => void]> = [];
    const req = {
      body: { messages: [{ role: "user" as const, content: "hello" }] },
      on: vi.fn((event: string, cb: () => void) => {
        events.push([event, cb]);
        return req;
      }),
    };
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      get headersSent() {
        return false;
      },
      get writableEnded() {
        return (this.end as ReturnType<typeof vi.fn>).mock.calls.length > 0;
      },
    };

    // Don't await — fire and let it hang
    handleChat(req as never, res as never);

    // Fetch should have been called by now (microtask)
    await vi.waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    expect(capturedSignal!.aborted).toBe(false);

    // Simulate client disconnect
    const closeCb = events.find(([e]) => e === "close")?.[1];
    expect(closeCb).toBeDefined();
    closeCb!();

    // Signal should now be aborted
    expect(capturedSignal!.aborted).toBe(true);
  });
});
