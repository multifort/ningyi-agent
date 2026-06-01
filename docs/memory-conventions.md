# Memory Conventions

Hermes has three memory systems. This file tells the agent how to use them on
THIS project so memory stays useful instead of noisy.

## 1. Persistent memory — `~/.hermes/MEMORY.md` (+ `USER.md`)
Short, durable facts the agent should carry across every session. Capped by
`memory.memory_char_limit` (default ~2200 chars) — treat it as scarce.

**Write to memory:** stable project facts (stack, key paths, release cadence),
standing preferences, automations that exist.
**Do NOT write:** transient task state, large outputs, anything already in `docs/`.
Prefer a pointer ("architecture is in docs/architecture.md") over a copy.

## 2. Reference docs — `docs/`
Anything longer or structured. The agent reads on demand. This is the right home
for detail that would blow the memory budget.

## 3. Cross-session recall — session search (FTS5)
Past conversations are full-text searchable with LLM summarization. The agent can
recover "how did we do X last week" without you re-explaining. You don't manage
this; just know it exists, so you don't need to repeat context endlessly.

## Operating guidance for the agent
- At task start: read `docs/context.md`; search sessions if the task references
  prior work.
- At task end: if a durable fact changed, update MEMORY.md (one line) and/or the
  relevant `docs/` file. Keep MEMORY.md lean.
- Never store secrets in memory or docs.
