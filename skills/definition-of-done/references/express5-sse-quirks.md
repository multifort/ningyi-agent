# Express 5 SSE Streaming Quirks

## `req.on("close")` fires prematurely

**Symptom:** SSE responses return empty (Content-Length: 0) or abort immediately.
Backend logs show `CLIENT_CLOSE` within 1ms of `FETCH_START`.

**Root cause:** In Express 5, `req.on("close")` fires when the request body stream
ends — which happens right after `express.json()` finishes reading the body. It is
NOT a client-disconnect signal.

**Fix:** Use `res.on("close")` instead for actual client-disconnect detection:

```typescript
// ❌ Wrong — fires after body consumed
req.on("close", () => controller.abort());

// ✅ Correct — fires when client actually disconnects
res.on("close", () => {
  if (!res.writableEnded) controller.abort();
});
```

## SSE headers must be set before first write

Set SSE headers BEFORE any async work that might send data:
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.setHeader("X-Accel-Buffering", "no");  // nginx buffering off
```

## Checking response writability

Use `res.writableEnded` (Express 5) instead of `res.headersSent`:
```typescript
if (!res.writableEnded) {
  endSSE(res, "error", { message });
}
```
