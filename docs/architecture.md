# Architecture

> Indexed-on-demand reference. Keep accurate; the agent will trust it.
> Pair every architectural change with an ADR in `docs/decisions/`.

## Overview
A two-piece web app. A React single-page app renders the chat UI and talks to a
thin Node backend over one streaming endpoint. The backend is a stateless proxy:
it holds the DeepSeek API key, forwards the conversation to DeepSeek's
OpenAI-compatible chat API with streaming enabled, and relays tokens back to the
browser as Server-Sent Events (SSE). No database in the MVP.

```
Browser (React, web/)
   │  POST /api/chat  { messages: [{role, content}, ...] }
   ▼
Node proxy (Express, server/)   ──holds DEEPSEEK_API_KEY──┐
   │  POST https://api.deepseek.com/v1/chat/completions    │ (stream: true)
   ▼                                                       ▼
DeepSeek Chat API  ──token stream──►  proxy  ──SSE──►  Browser renders incrementally
```

## Components
| Component | Responsibility | Key paths |
| --- | --- | --- |
| Web SPA | Chat UI: message list, input, incremental/streamed render, markdown, stop/regenerate, autoscroll, responsive layout. Conversation state in React (`useReducer`); no router needed for MVP. | `web/` |
| Backend proxy | One endpoint `POST /api/chat`. Validates/limits input, calls DeepSeek with `stream: true`, relays tokens as SSE, supports cancellation, hides the API key. | `server/` |
| DeepSeek Chat API | External LLM. OpenAI-compatible. Default model `deepseek-chat`. | external |

## Data & external dependencies
- **Only external dependency: DeepSeek API** (`https://api.deepseek.com/v1`).
- **No datastore in the MVP.** Conversation history is kept in browser memory for
  the session; a refresh clears it. (Persistence is a future ADR.)
- **Backend env vars:** `DEEPSEEK_API_KEY` (required), `PORT` (default 8787),
  `DEEPSEEK_MODEL` (default `deepseek-chat`), `ALLOWED_ORIGIN` (dev CORS).

## Contract: `POST /api/chat`
- Request body: `{ "messages": [{ "role": "user|assistant|system", "content": "..." }] }`.
- Response: `Content-Type: text/event-stream`. Emits incremental text deltas; a
  terminal event signals completion. Client aborts the fetch to cancel; the proxy
  must abort its upstream DeepSeek request when the client disconnects.

## Runtime & environments
- **Dev:** Vite dev server (:5173) proxies `/api/*` to the backend (:8787) — avoids
  CORS and keeps the key off the browser. `make dev` runs both.
- **Prod (later):** build `web/` to static assets; serve them from `server/` (or a
  static host) with the backend deployed separately. The scaffold `Dockerfile`
  containerizes the backend; docker-compose topology is a later exercise.

## Build / test / deploy
- Install: `make install`  ·  Dev: `make dev`  ·  Test: `make test`  ·  Lint: `make lint`
- Build frontend: `make build`  ·  Quality gate: `make review` (lint + test)

## Known constraints & risks
- **Key exposure** — never ship `DEEPSEEK_API_KEY` to the client; all calls via
  `server/`. The repo `.env` (app key) is gitignored and distinct from Hermes' key.
- **Streaming correctness** — backpressure, partial chunks, and cancellation must
  be handled; a dropped client should abort the upstream call.
- **Latency / cost** — `deepseek-chat` keeps replies fast and cheap; surface a
  visible "thinking/streaming" state. Add timeouts and input-size limits.
- **No persistence** — acceptable for MVP; revisit when conversations must survive
  reloads or scale across devices.