# Hermes Project Scaffold

A clone-and-go template for managing a **software project** with
[Hermes Agent](https://github.com/NousResearch/hermes-agent) as the orchestrator.
The goal is a **repeatable development pattern**: Hermes owns the task lifecycle
(spec → plan → implement → test → review → ship), captures repeatable procedures
as skills, and remembers project context across sessions.

> Status: **complete** — see the per-area docs below and `GUIDE.md` for the playbook.

## Design decisions baked in
- **Language-agnostic** — no assumptions about your stack.
- **Provider: DeepSeek** — built-in `deepseek` provider, `deepseek-v4-pro` (switchable; strong, low-cost coding).
- **Execution: local** for development; the `Dockerfile` builds the deployment
  image (docker-compose topology is a later exercise).
- **Implementation lane: hybrid** — Hermes implements by default; heavier coding
  can be delegated to the Claude Code CLI while Hermes keeps ownership.
- **Gateway/messaging: not included** by default (optional add-on).

## Quick start
```bash
# 0. Install Hermes Agent first: https://hermes-agent.nousresearch.com/docs
git clone <this-scaffold> my-project && cd my-project
./bootstrap.sh                                  # config + identity + skills(external_dirs) + key forwarding
hermes config set DEEPSEEK_API_KEY sk-...        # if bootstrap didn't already forward it
# fill in .hermes.md "Project facts", docs/context.md, docs/architecture.md, Makefile commands
make install-hooks                              # optional pre-commit gate
hermes                                          # run from repo root; loads .hermes.md as the brain
```

## What's here
| Path | Role |
| --- | --- |
| `.hermes.md` | **Orchestration brain** — how Hermes manages this project. |
| `AGENTS.md` | **Implementation conventions** — read by the coding lane. |
| `config/hermes.config.snippet.yaml` | Recommended global config (reference). |
| `config/SOUL.md` | Agent identity, installed to `~/.hermes/SOUL.md`. |
| `bootstrap.sh` | Idempotent setup: config, identity, key forwarding, skills external_dirs. |
| `Dockerfile` | Deployment image (dev runs local). |
| `Makefile` + `scripts/` | Mechanical gates: `make review`/`validate` + pre-commit hook. |
| `skills/` | Project skill library + `MANIFEST.md`. |
| `workflows/` | The dev loop and the optional Claude Code lane. |
| `automation/` | Cron, curator policy, optional gateway. |
| `docs/` | Context, architecture, glossary, decisions, specs. |

## How config & secrets work (important)
Hermes config is **global** (`~/.hermes/config.yaml`), not per-repo. The scaffold
ships intended values in `config/hermes.config.snippet.yaml` and applies them via
`bootstrap.sh`. Per-project behavior comes from the repo's `.hermes.md` + `docs/`,
loaded by working directory. Two specifics:
- **Provider key** lives in `~/.hermes/.env` via `hermes config set DEEPSEEK_API_KEY`
  — the DeepSeek provider reads that env var ONLY (it ignores api_key in
  config.yaml). Not the repo `.env` (which is only for project/Docker vars).
- **Project skills** are registered via `skills.external_dirs` pointing at the repo
  `skills/` (live, no copy/drift) — not copied into `~/.hermes/skills/`, and so
  outside the Curator's scope (no pinning).

## Read next
- `TUTORIAL.md` — 上手与复制到新项目的全流程教程。
- `GUIDE.md` — the development-pattern playbook.
- `workflows/dev-loop.md` — the authoritative loop.
- `VALIDATION.md` — verify on your machine.

## Targets Hermes Agent v0.14.x
Confirm on first run (see VALIDATION.md): that `hermes setup` set the DeepSeek
provider (base_url https://api.deepseek.com) and a valid model string
(`hermes model`), and the plan-mode output path. Confirm the Dockerfile install
path against the current install guide.
