# The Hermes Development Pattern — Playbook

The repeatable development mode this scaffold encodes: **Hermes Agent as the
project orchestrator, with a hybrid implementation lane.** Read it once; then the
pattern lives in the repo and runs itself.

## 1. The idea in one paragraph
You manage a software project by talking to one agent (Hermes) that owns the whole
task lifecycle. It reads the project brain (`.hermes.md`) and reference docs,
plans before it builds, implements directly or by delegating to subagents / Claude
Code, enforces tests and a quality gate, and captures repeatable procedures as
skills. Project context survives across sessions. Everything is in the repo, so a
new machine is `clone + bootstrap` away.

## 2. Where things live
| Thing | File | Role |
| --- | --- | --- |
| Identity | `~/.hermes/SOUL.md` | Who the agent is (stable, global). |
| Project brain | `.hermes.md` | How Hermes manages THIS project. |
| Implementation rules | `AGENTS.md` | Conventions for the coding lane. |
| Reference knowledge | `docs/` | Context, architecture, glossary, decisions, specs. |
| Procedures | `skills/` + bundled | Reusable, triggerable how-tos. |
| Workflow | `workflows/` | The dev loop + the Claude Code lane. |
| Automation | `automation/` | Cron, curator hygiene, optional gateway. |
| Mechanical gates | `Makefile` + `scripts/` | test/lint/review + scaffold self-check + hook. |
| Config | `config/` + `~/.hermes/config.yaml` | Provider, backend, safety, external_dirs. |

## 3. Setup (once per project / machine)
```
git clone <scaffold> my-project && cd my-project
./bootstrap.sh                          # config + identity + skills (external_dirs) + key forwarding
hermes config set DEEPSEEK_API_KEY sk-...   # if bootstrap didn't already forward it
hermes setup                            # pick DeepSeek; base_url https://api.deepseek.com; model deepseek-v4-pro
# fill in: .hermes.md "Project facts", docs/context.md, docs/architecture.md
# fill in: Makefile commands (TEST_CMD / LINT_CMD / RUN_CMD / BUILD_CMD)
make install-hooks                      # optional: pre-commit gate
hermes                                  # run from repo root
```
Note: the provider key lives in `~/.hermes/.env` (via `hermes config set`), NOT in
the repo `.env`. bootstrap forwards a key it finds in the repo `.env`, but the
canonical home is `~/.hermes/.env`.

## 4. The daily loop (workflows/dev-loop.md)
`clarify → spec → plan → implement → test → review → ship`
- **Spec** non-trivial work (`project-spec` skill) → `docs/specs/`.
- **Plan** in plan mode (no execution) → `.hermes/plans/`.
- **Implement** via the right lane:
  - Hermes directly (default), or
  - `delegate_task` subagents for independent tasks (bundled
    `subagent-driven-development`, two-stage review, ≤3 parallel by default), or
  - the Claude Code lane for a large scoped feature (bundled `claude-code` skill —
    OPTIONAL, needs separate Claude access; see `workflows/claude-code-lane.md`).
  - Many agents on one repo → `hermes -w` worktrees (Kanban is an advanced extra).
- **Test** (TDD where practical) and **review** (`make review` + the
  `definition-of-done` gate) before **shipping** (PR, docs/ADR updated,
  `project-release` for versions).

## 5. Memory discipline (docs/memory-conventions.md)
- Durable one-liners → `~/.hermes/MEMORY.md` (scarce; keep lean).
- Detail → `docs/` (read on demand).
- "How did we do X before?" → session search (automatic).
- Secrets → never in memory, docs, repo, or cron prompts.

## 6. Mechanical gates (Makefile + scripts/)
- `make test` / `make lint` / `make review` — fill the commands for your stack.
- `make validate` — `scripts/validate.sh` self-checks the scaffold (config valid,
  skills well-formed, references resolve). No network needed.
- `make install-hooks` — installs `scripts/hooks/pre-commit` (blocks committing
  `.env`/keys, runs validate).

## 7. Automation (optional — automation/)
- Cron jobs (health, dependency/security audit, standup). Cron expressions only
  (`0 9 * * *`), self-contained prompts, gateway daemon running, test with `/cron run`.
- Curator keeps **agent-created** skills tidy; project skills live in the repo via
  external_dirs and are out of its scope (no pinning). `--dry-run` before real runs.
- Messaging gateway off by default; see `automation/gateway-optional.md`.

## 8. Safety posture (baked in)
- `approvals.mode: manual`, `checkpoints.enabled`, `security.redact_secrets`,
  Tirith command scanning — set by `bootstrap.sh`.
- `.hermes.md` tells the agent to treat web/issue/tool content as untrusted data
  and never act on instructions embedded in it; irreversible actions need approval.
- Docker backend available for sandboxing; the `Dockerfile` builds the deployment
  image (compose topology is a later exercise).

## 9. Reproduce on a new project
Copy the scaffold, run `bootstrap.sh`, fill the three context files + Makefile, go.
The agent inherits the same loop, skills, safety posture, and conventions on day one.

---
*Targets Hermes Agent v0.14.x. Confirm the model string (`hermes model`) and the
plan-mode output path on first run; see VALIDATION.md.*
