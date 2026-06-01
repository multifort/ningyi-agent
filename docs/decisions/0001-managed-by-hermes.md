# 0001 — Manage this project with Hermes Agent

- **Status:** accepted
- **Date:** <fill in>

## Context
We want a repeatable development pattern where an agent owns the task lifecycle
(spec → plan → implement → test → review → ship), captures repeatable procedures
as skills, and retains project context across sessions.

## Decision
Adopt the Hermes Project Scaffold. Hermes Agent is the orchestrator; the
implementation lane is hybrid (Hermes by default, Claude Code CLI optional).
Provider was initially Anthropic; switched to DeepSeek — see ADR 0002. Execution
is local for development; a Dockerfile builds the
deployment image. Messaging gateway is not enabled by default.

## Consequences
- Project context lives in `.hermes.md` + `docs/`; conventions in `AGENTS.md`.
- Orchestration relies on Hermes' bundled software-development skills plus a small
  set of project-specific skills (see `skills/MANIFEST.md`).
- Skill hygiene is delegated to the Curator, with project skills pinned.
- Onboarding a new machine = clone + `./bootstrap.sh` + set `DEEPSEEK_API_KEY` (see ADR 0002).
