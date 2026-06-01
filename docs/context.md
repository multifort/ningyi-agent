# Project Context (read first)

> One page. The agent reads this to orient before acting. Keep it short and true.

## What this is
A DeepSeek-style **AI chat assistant**: a web app where a user has a multi-turn,
streaming conversation with an AI. Minimal and focused — "just chat" done well.

## Current state
**Greenfield.** Only the Hermes scaffold exists; the app is not built yet. The MVP
target below is the first thing to build. Tracks: `web/` (UI) then `server/` (proxy).

### MVP (build this first)
- Single conversation, multi-turn (the model sees prior turns).
- **Streaming** responses (tokens appear as they arrive).
- Markdown rendering of replies (code blocks, lists).
- Stop generation; regenerate last reply; clear conversation.
- Mobile-friendly, responsive layout.

### Explicitly out of scope (for now)
Auth/accounts, server-side persistence/DB, file/image upload, multiple models or
model picker, retrieval (RAG), tools/function-calling. Add only on request, with an ADR.

## How to work here
- Install deps: `make install`
- Run locally: `make dev`  (frontend http://localhost:5173, backend :8787)
- Run tests: `make test`
- Lint / format: `make lint` / `make fmt`
- Build frontend: `make build`

## Constraints that matter
- **API key stays server-side.** The browser must never receive `DEEPSEEK_API_KEY`.
  All model calls go through `server/`. (App key lives in the repo `.env`; Hermes'
  own key is separate, in `~/.hermes/.env`.)
- **Streaming must work end-to-end** (SSE), including user-initiated cancellation.
- Keep latency low: default model `deepseek-chat`; stream first token fast.
- No persistence in the MVP — conversation lives in the browser session only.

## Where to look
- Architecture & data flow → `docs/architecture.md`
- Decisions → `docs/decisions/` (provider choice is ADR 0002)
- Vocabulary → `docs/glossary.md`