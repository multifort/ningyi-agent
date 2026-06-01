# Skills Manifest

The development pattern leans on Hermes' **bundled** software-development skills
(maintained by Nous — don't reinvent them) plus a few **project-specific** skills.

## Bundled skills the workflow relies on
Loaded automatically by trigger; listed here so the workflow is legible.
- `software-development/subagent-driven-development` — execute a plan via fresh
  `delegate_task` subagents with two-stage (spec + quality) review.
- `software-development` plan skill — write bite-sized implementation plans (plan mode).
- `test-driven-development` — enforce red → green → refactor.
- pre-commit review — security scan + quality gates + auto-fix before committing.
- `autonomous-ai-agents/claude-code` (or `codex`) — hand a scoped feature to an external
  coding CLI as an isolated implementation lane. OPTIONAL: the `claude` CLI needs
  separate Anthropic access, independent of Hermes' DeepSeek provider.
- `github-pr-workflow` — open/manage PRs.

Browse what's installed: `hermes skills list`. Test one:
`hermes --toolsets skills -q "Use the test-driven-development skill to ..."`.

## Project-specific skills (in this repo)
| Skill | Purpose |
| --- | --- |
| `project-spec` | Turn a request into this project's short, testable spec. |
| `definition-of-done` | The gate every change must pass before it ships. |
| `project-release` | This project's release/version/tag/changelog procedure. |

## How they're available
`bootstrap.sh` registers this directory via `skills.external_dirs` in
`~/.hermes/config.yaml`, so Hermes discovers these skills live from the repo
(edit-in-place, no copy, no drift). Because they live in an external dir, the
Curator does not manage them — no pinning required. Project skills still override
bundled ones with the same trigger name.

## Optional: bundle them
Create a loadable bundle for this project:
```
hermes bundles create <project> \
  --skill project-spec --skill definition-of-done \
  --skill test-driven-development --skill subagent-driven-development \
  -d "Dev loop for <project>"
```
Then `/<project>` in a chat loads the set.
