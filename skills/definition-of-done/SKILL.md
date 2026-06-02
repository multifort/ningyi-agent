---
name: definition-of-done
description: The gate a change must pass before it is considered shippable on this project. Use before proposing a commit, opening a PR, or reporting a task complete.
version: 1.0.0
metadata:
  hermes:
    tags: [quality, review, project]
    category: software-development
---
# Definition of Done

## When to Use
Before claiming any non-trivial change is finished — before commit, PR, or
"done". This is the project's quality gate.

## Procedure
Run through every item. If one fails, the change is NOT done.
1. **Acceptance criteria met** — re-read the spec; each criterion is satisfied.
2. **Tests** — new behavior has tests; the full suite passes locally
   (`<test command from docs/context.md>`).
3. **Pre-commit review** — run the bundled pre-commit review (security + quality).
4. **No secrets** — diff contains no keys, tokens, or credentials.
5. **Docs current** — if architecture/behavior changed, `docs/architecture.md`
   and an ADR in `docs/decisions/` are updated in the same change.
6. **Scope clean** — the diff only contains what the spec called for.
7. **Reversible** — the change is behind a flag or easily revertible if risky.

## Pitfalls
- **Content filter**: `write_file` and `patch` can mangle strings like `process.env.XXX` or `"7d"`. See `references/content-filter-workaround.md` for workarounds.
- **Stale background processes**: `npm --prefix server run dev` with `background=true` leaves orphan tsx processes that spam notifications. Before restarting the backend, kill existing: `kill $(lsof -t -i :8787) 2>/dev/null`.
- **GitHub push hangs**: If `git push origin main` hangs with credential helper, use direct URL: `GIT_TERMINAL_PROMPT=0 git push "https://user:token@github.com/owner/repo.git" main`.
- Marking done with skipped/xfail tests left silently in place.
- "I'll update docs later" — later never comes; do it in the same change.
- Bundling unrelated refactors into the diff.

## Verification
- Every checklist item above is explicitly confirmed in the task summary, with the
  test command output referenced.
- For this project, completed phases must be reported to Feishu via
  `send_message(target="feishu:oc_ec652a7140854eb6ef28e13ff478cb07")`.

## References
- `references/express5-sse-quirks.md` — Express 5 SSE streaming pitfalls and fixes
- `references/vite-cors-theming.md` — Vite host binding, CORS, and CSS theming patterns
- `references/content-filter-workaround.md` — write_file/patch string mangling workarounds
- `references/ui-patterns.md` — DeepSeek风格 + 元宝式输入框 + 登录动画 UI 设计模式
