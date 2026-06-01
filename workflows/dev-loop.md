# Development Loop (orchestration)

The repeatable pattern Hermes follows on this project. Hermes owns the lifecycle;
implementation is hybrid (Hermes by default, Claude Code lane optional).

## The loop
```
clarify → spec → plan → implement → test → review → ship
```

### 1. Clarify
Restate the request and scope. Ask at most one clarifying question if intent is
genuinely ambiguous; otherwise proceed and state assumptions.

### 2. Spec  (skill: project-spec)
For non-trivial work, write a testable spec to `docs/specs/`. Trivial fixes skip
this.

### 3. Plan  (plan mode)
Enter plan mode to produce a bite-sized task plan WITHOUT executing. Plans are
written as markdown to `.hermes/plans/` (verify this path on first run). A good
plan lists discrete tasks, the files each touches, and the verification for each.

### 4. Implement
Choose the lane per task:
- **Hermes directly** (default) — small/medium tasks, tight feedback loops.
- **Subagents** (`delegate_task`) — when tasks are *genuinely independent*
  (different files/modules). Use the bundled `subagent-driven-development` skill:
  fresh subagent per task + two-stage (spec then quality) review.
  - Each `delegate_task(goal=..., context=...)` gets an isolated conversation +
    terminal. `context` MUST be self-contained (project path, stack, constraints).
  - Default max 3 concurrent (`delegation.max_concurrent_children`); only the
    final summary returns to the parent. Synchronous — don't use it for work that
    must outlive the turn (use cron / background process for that).
  - If two tasks may touch the same file, don't parallelize them — do that file
    yourself after.
- **Claude Code lane** (optional; needs separate Claude access) — hand a larger,
  well-scoped feature to the bundled `claude-code` skill (see `claude-code-lane.md`)
  while Hermes keeps ownership of lifecycle, testing, and reconciliation. Claude Code
  uses Anthropic, independent of Hermes' DeepSeek provider; if unavailable, implement
  with Hermes (DeepSeek is strong at coding) or an OpenAI-compatible coding CLI.

For multiple agents on the SAME repo in parallel, use worktree isolation:
`hermes -w` gives each agent its own git checkout (config: `worktree: true`,
`.worktreeinclude` lists gitignored files to copy in). See
`claude-code-lane.md` for the optional Claude Code implementation lane.

> Advanced/optional: for coordinating many agents across profiles, Hermes also
> has a Kanban board. Treat it as an advanced add-on — not required for the core
> loop — and enable it only when single-repo worktrees aren't enough.

### 5. Test  (skill: test-driven-development)
New logic is TDD where practical: red → green → refactor. Bug fixes get a
regression test. Run the project's test command (see `docs/context.md`).

### 6. Review  (bundled pre-commit review + skill: definition-of-done)
Run the pre-commit review (security scan + quality gates + auto-fix), then walk
the `definition-of-done` checklist. If anything fails, the change is not done.

### 7. Ship
Open/describe the PR (`github-pr-workflow`), update `docs/` + ADR in the same
change, and summarize what changed, how it was tested, and what was left out.
Releases follow the `project-release` skill.

## When to parallelize (quick guide)
| Situation | Lane |
| --- | --- |
| One focused change | Hermes directly |
| 2-3 independent tasks, different files | `delegate_task` batch |
| Large scoped feature | Claude Code lane |
| Several agents, same repo, long-running | worktrees (+ Kanban, advanced) |
| Must run unattended / later | cron job (see `automation/`) |
