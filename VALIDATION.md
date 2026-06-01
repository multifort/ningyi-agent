# Validation

Two layers: static checks (run against the scaffold) and a live checklist you run
on your machine, since a real Hermes install is needed for runtime behavior.

## A. Static checks — `make validate`
`scripts/validate.sh` verifies (no network):
- `config/hermes.config.snippet.yaml` is valid YAML, references a DeepSeek model,
  and sets `terminal.backend: local`.
- Every project `SKILL.md` has valid frontmatter (`name`/`description`/`version`)
  and the required sections (When to Use / Procedure / Pitfalls / Verification).
- `skills/MANIFEST.md` references every project skill.
- `bootstrap.sh` sets the DeepSeek model, forwards `DEEPSEEK_API_KEY` to
  `~/.hermes/.env`, and registers the skills external_dir.
- Every internal doc reference resolves; `.gitignore` ignores `.env`.

Run it anytime: `make validate`. After bootstrap, `hermes config` should show your
`skills.external_dirs` pointing at the repo.

## B. Live checklist (run on your machine)
Use a throwaway sample project before trusting the pattern.

1. **Install & bootstrap**
   - Install Hermes (`https://hermes-agent.nousresearch.com/docs`).
   - `./bootstrap.sh` → no errors. Then run `hermes setup` (pick DeepSeek, base URL
     https://api.deepseek.com, model deepseek-v4-pro) to lock the provider.
     `hermes config` shows a deepseek model, `terminal.backend: local`,
     `approvals.mode: manual`.
   - Key for Hermes: `hermes config set DEEPSEEK_API_KEY sk-...` (writes to
     `~/.hermes/.env`; the DeepSeek provider reads that env var only).
   - `make install-hooks`, then `make validate` passes.
   - bootstrap's Hermes-version check and the `claude` capability check print
     sensible info/warnings.

2. **Confirm the two flagged unknowns**
   - **Model/provider:** `hermes model` → confirm a DeepSeek model (e.g.
     `deepseek-v4-pro`) is active and the provider is `deepseek` with base_url
     https://api.deepseek.com. Use `hermes setup` to fix if not.
   - **Plan-mode path:** the docs indicate plans are written to `.hermes/plans/`;
     trigger plan mode once and confirm the folder appears (fix `dev-loop.md` /
     `.hermes.md` if the real path differs).

3. **Context loads** — from the repo root, `hermes` → ask "what project am I in
   and how do I run tests?" The answer should reflect `.hermes.md` + `docs/context.md`.

4. **Skills discovered via external_dirs**
   - `hermes skills list` shows `project-spec`, `definition-of-done`,
     `project-release` (no copy into `~/.hermes/skills/`).
   - They're outside the Curator's scope — no pin needed.
   - `hermes --toolsets skills -q "Use the project-spec skill to spec a tiny
     feature"` produces a spec in `docs/specs/`.

5. **One full loop** — give a small feature request. Expect spec → plan →
   implement → tests → review (`make review`) → definition-of-done → PR/summary,
   with the DoD checklist in the summary.

6. **Delegation (optional)** — ask for two independent changes "in parallel";
   confirm `delegate_task` spawns subagents (≤3) and only summaries return.

7. **Automation (optional)** — `hermes gateway install`; add the weekday
   health-check cron from `automation/cron-jobs.md`; `hermes cron list`;
   `/cron run <id>`. `hermes curator run --dry-run` and read the report.

## C. What this scaffold does NOT verify
- A live, network-dependent Hermes run (do it on your machine).
- Exact CLI flags for your Hermes version — confirm against the version's docs.
- The Dockerfile install path — confirm against the current install guide before
  relying on the deployment image.
