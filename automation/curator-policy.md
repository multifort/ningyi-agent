# Curator Policy (skill hygiene)

The Curator is a background pass that keeps **agent-created** skills tidy. It
**never touches bundled or hub-installed skills**, and **never auto-deletes** —
the worst case is archival to `~/.hermes/skills/.archive/`, which is recoverable.

## Automatic behavior
- Unused for `stale_after_days` (30) → marked stale.
- Unused for `archive_after_days` (90) → moved to `.archive/`.
- A periodic LLM pass may consolidate/patch agent-created skills.

## Project skills are out of scope (no pinning needed)
This scaffold's project skills (`project-spec`, `definition-of-done`,
`project-release`) live in the repo and are registered via
`skills.external_dirs`, NOT copied into `~/.hermes/skills/`. The Curator only
manages agent-created skills in `~/.hermes/skills/`, so project skills are never
archived or consolidated — no `hermes curator pin` required for them.

Pinning still matters for **agent-created** skills you want to protect:
```
hermes curator pin <skill-name>
```
Pinned skills can still be patched/improved; they just can't be archived or
consolidated away.

## Operating safely
- Preview before any real run: `hermes curator run --dry-run` (writes a report,
  mutates nothing).
- Inspect state: `hermes curator status` (last run, counts, pinned list).
- Snapshots are taken automatically before every real pass; rollback is one
  command. You can also snapshot manually (tar.gz of `~/.hermes/skills/`).

## Recommendation
Keep the Curator on for agent-created clutter. Project skills need no pinning
(they are external_dir, out of scope). Pin only agent-created skills you want to
protect, and always `hermes curator run --dry-run` before a real pass.
