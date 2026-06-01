# Project Skills

Reusable procedures in the Hermes/agentskills.io `SKILL.md` format. Each is a
folder with a `SKILL.md` (frontmatter + `When to Use` / `Procedure` / `Pitfalls`
/ `Verification`). See `MANIFEST.md` for the full picture, including the bundled
skills the workflow relies on (we don't reinvent those).

## How they load (external_dirs — no copy, no drift)
`bootstrap.sh` registers THIS directory in `skills.external_dirs` in
`~/.hermes/config.yaml`. Hermes scans it for discovery on each session, so when
you edit a skill here, the change is live next run — no re-install, no stale copy.

Two consequences worth knowing:
- **Curator-safe by design.** The Curator only manages agent-created skills in
  `~/.hermes/skills/`. External-dir skills are outside its jurisdiction, so these
  never get archived/consolidated and need no pinning.
- **Local shadowing.** If a skill with the same `name` also exists in
  `~/.hermes/skills/`, the local one wins. Don't duplicate names there.

## Authoring a new skill
1. `mkdir skills/<name>` and add `SKILL.md` with the standard frontmatter.
2. Optionally add `references/`, `templates/`, `scripts/` beside it.
3. Test: `hermes --toolsets skills -q "Use the <name> skill to ..."`.
4. No re-install needed — it's discovered from the external_dir on next session.

## In this repo
- `project-spec/` — request → testable spec (writes to `docs/specs/`).
- `definition-of-done/` — the shippability gate.
- `project-release/` — version/tag/changelog/deploy-verify.
