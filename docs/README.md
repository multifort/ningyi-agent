# docs/ — Context & Memory Layer

This directory is the project's **durable, human-curated knowledge**. It is the
counterpart to Hermes' own memory systems. Knowing what lives where keeps the
agent accurate without bloating its context.

## Where knowledge lives (and who owns it)

| Layer | Location | Owner | Loaded how |
| --- | --- | --- | --- |
| Agent identity | `~/.hermes/SOUL.md` | you (stable) | Always, slot #1 of system prompt |
| Project brain | repo `/.hermes.md` | you + agent | Auto-loaded when run in repo (highest project priority) |
| Implementation rules | repo `/AGENTS.md` | you | Read by the coding lane (Claude Code etc.) |
| **Reference docs** | **`docs/*.md`** | **you + agent** | **On demand via `read_file` — point to them from `.hermes.md`** |
| Persistent memory | `~/.hermes/memories/MEMORY.md`, `USER.md` | agent | Auto, capped (see config) |
| Cross-session recall | session DB (FTS5) | agent | `search_sessions` over past conversations |

Key point: `docs/` is **not auto-indexed** into the prompt. The agent reads these
files when the brain (`.hermes.md`) tells it to, or when a task needs them. So the
contract is: keep `docs/` accurate, and reference the right doc from `.hermes.md`.

## What goes in each file
- `context.md` — the 1-page project overview the agent should read first.
- `architecture.md` — components, data, how it runs. Keep current.
- `glossary.md` — domain vocabulary, so agent and humans stay consistent.
- `decisions/NNNN-*.md` — architecture decision records (ADRs).
- `memory-conventions.md` — how the agent should use MEMORY.md / sessions.

## Maintenance rule
Stale docs are worse than no docs — the agent will trust them. When a decision
changes the system, update `architecture.md` and add an ADR in the same change.
