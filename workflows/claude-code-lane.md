# Optional Implementation Lane: Claude Code CLI

The hybrid model (Phase 0): Hermes owns the lifecycle; for larger, well-scoped
coding work it can hand implementation to **Claude Code** while keeping ownership
of planning, testing, review, and reconciliation. **Off until you install it.**

> Requires SEPARATE Claude/Anthropic access for the `claude` CLI — independent of
> Hermes' model provider (DeepSeek). If you do not have that access, skip this
> lane: Hermes implements directly (DeepSeek V4 is strong at coding), or you can
> point an OpenAI-compatible coding CLI (e.g. OpenCode) at DeepSeek instead.

## Setup
1. Install the Claude Code CLI (`claude`) and authenticate it (uses your
   Anthropic account/key).
2. Verify: `claude --version`. `bootstrap.sh` reports whether `claude` is present.
3. Hermes ships the bundled skill `autonomous-ai-agents/claude-code`
   ("Delegate coding to Claude Code CLI") — no install needed, it triggers when
   relevant. Confirm with `hermes skills list | grep claude-code`.

## How Hermes drives it
Claude Code is driven through Hermes' `terminal` tool (it is not an ACP child —
today only Copilot is, via `delegate_task(acp_command="copilot")`).

- **Print mode (preferred)** — one-shot, no interactive prompts:
  ```
  claude -p "Add retry/backoff to all outbound HTTP calls in src/http/" \
    --allowedTools "Read,Edit,Bash" --max-turns 10
  ```
  Run with a `workdir` set to the repo and a sensible `timeout`.
- **Interactive mode** — requires `tmux` (Claude Code is a full TUI). Use only
  when you need to monitor/steer a long session.

## Conventions
- Claude Code reads `AGENTS.md` for this project's coding conventions — keep it current.
- Scope each delegation tightly with `--allowedTools`; do NOT use
  `--dangerously-skip-permissions` by default.
- Hermes remains the owner: after Claude Code returns, Hermes runs `make review`
  (lint + test) and the `definition-of-done` gate before anything ships.

## When to use this lane
Large or repetitive implementation in a well-understood area. For small changes,
Hermes implements directly; for independent parallel tasks, prefer `delegate_task`
subagents (see `dev-loop.md`).
