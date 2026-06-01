# Implementation Conventions

> Read by implementation agents (e.g. Claude Code CLI) and any AGENTS.md-aware
> tool. Language-agnostic defaults — tailor per project.

## Code
- Match the existing style of the file/module you touch.
- Small, focused changes; one logical change per commit.
- New dependency ⇒ add a one-line rationale to `docs/decisions/`.

## Tests
- New behavior ships with tests; bug fixes ship with a regression test.
- Prefer TDD for non-trivial logic: red → green → refactor.
- The full suite must pass locally before "done" (command: see `docs/context.md`).

## Commits & PRs
- Imperative, scoped subjects (e.g. `auth: handle expired tokens`).
- PR description: what changed, why, how it was tested.

## Definition of done
A change is done only when it passes the `definition-of-done` gate: acceptance
criteria met, tests pass, pre-commit review clean, no secrets, docs/ADR updated,
scope clean, reversible. Don't report "done" otherwise.

## Docs
- Architecture → `docs/architecture.md`; decisions → `docs/decisions/NNNN-*.md`;
  vocabulary → `docs/glossary.md`. Specs → `docs/specs/`.

## Safety
- Never print or commit secrets.
- Ask before irreversible actions (force-push, history rewrite, data deletion).
