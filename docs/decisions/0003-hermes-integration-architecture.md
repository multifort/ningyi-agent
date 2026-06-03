# 0003 — Hermes integration: dual-mode + subprocess bridge

- **Status:** accepted
- **Date:** 2026-06-03

## Context
The app started as a thin DeepSeek chat proxy. To become a full AI assistant it
needs tool-calling, skills, persistent memory, and scheduled tasks — exactly what
Hermes Agent provides. The question was *how* to connect the Express backend to
Hermes without regressing the fast, simple chat experience.

Two forces shaped the design:
1. **Hermes ships a CLI, not an HTTP API.** A POC confirmed there is no gateway
   HTTP endpoint suitable for request/response; `hermes chat -q` is the
   programmatic surface. It also revealed that `session_id` is printed on
   **stderr** (quiet mode) and that **verbose** mode is the only way to observe
   tool activity (ANSI-decorated markers like `┊ 💻 $ <cmd>  <dur>s`).
2. **Chat must stay fast.** Agent runs are slower (multi-turn, tool use), so they
   can't replace the direct DeepSeek path.

## Decision
1. **Dual-mode, additive.** Keep `mode: "chat"` (direct DeepSeek) as the default.
   Add `mode: "agent"` that routes through a new `HermesBridge`. One toggle in the
   input switches modes; the two server paths are fully independent.
2. **Subprocess bridge.** `hermes-bridge.ts` spawns `hermes chat`, parses output
   (verbose for tool events, quiet as fallback), and maps `conversation_id →
   hermes_session` (table `agent_sessions`) so `--resume` carries multi-turn
   context. Streaming is simulated by chunking the buffered reply (the CLI does
   not stream), preceded by replayed `tool_start`/`tool_end` events.
3. **Graceful degradation.** If Hermes is unavailable, Agent requests return a
   `fallback` flag and the frontend transparently retries in Chat mode. Chat mode
   never depends on Hermes.
4. **Built on top:** Memory (`memories` + DeepSeek auto-extraction), Skills
   (`hermes -s` invocation + project/builtin discovery), Scheduler (in-process
   cron ticker firing tasks through the bridge).

## Consequences
- **Easier:** no new long-running daemon; the bridge is stateless per call; the
  app runs fully even with Hermes absent (degraded). Deployment just needs the
  `hermes` binary on PATH (Dockerfile installs it, pinned).
- **Harder / accepted trade-offs:**
  - Tool visibility relies on parsing ANSI verbose output — inherently more
    fragile than a structured API. Mitigated by ANSI-strip + marker matching and
    unit tests over fixtures (`hermes-bridge.test.ts`).
  - **No discrete plan/step events** from the CLI, so the planned "multi-step
    progress bar" (design T2-3) is represented instead by live-updating tool-call
    cards (running→done with real durations). This is the honest mapping of
    available data; a true step bar would require fabricated structure.
  - Latency: Agent replies appear after the run completes (chunked typing effect),
    not truly token-streamed. Acceptable given Agent mode is opt-in and labeled.
- **Follow-ups:** if Hermes later exposes a gateway HTTP/streaming API, swap the
  bridge's transport (the `HermesBridgeOptions` seam already anticipates a
  `bridgeMode`) for real streaming and structured tool/step events.
