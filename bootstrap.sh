#!/usr/bin/env bash
# Bootstrap a project (using this scaffold) to be managed by Hermes Agent.
# Idempotent: safe to re-run.
#  - checks Hermes is installed and a compatible version
#  - applies recommended config (Phase 0 decisions)
#  - forwards the DeepSeek key into ~/.hermes/.env (where Hermes reads secrets)
#  - registers this repo's skills/ as a read-only external skill dir (no copy/drift)
#  - reports optional capabilities (Claude Code lane, gateway)
# Does NOT install Hermes itself.
#
# Usage:  ./bootstrap.sh
set -euo pipefail

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

TESTED_MAJOR_MINOR="0.14"   # scaffold targets Hermes v0.14.x

# 1) Preconditions ------------------------------------------------------------
if ! command -v hermes >/dev/null 2>&1; then
  warn "hermes CLI not found. Install Hermes Agent first, then re-run."
  warn "  see: https://hermes-agent.nousresearch.com/docs"
  exit 1
fi
VER="$(hermes --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
say "hermes found: ${VER:-unknown version}"
# Item 8: warn (non-fatal) on a major/minor mismatch so fast Hermes releases
# don't break things silently.
if [ -n "$VER" ]; then
  MM="$(printf '%s' "$VER" | cut -d. -f1-2)"
  if [ "$MM" != "$TESTED_MAJOR_MINOR" ]; then
    warn "scaffold targets Hermes v${TESTED_MAJOR_MINOR}.x but found v${VER}."
    warn "  CLI flags/paths may differ — sanity-check against your version's docs."
  fi
fi
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# 2) Local .env (for project tooling / Docker — NOT how Hermes reads its key) --
if [ ! -f .env ]; then
  cp .env.example .env
  say "created .env from .env.example (project/Docker use; Hermes key is set below)"
else
  say ".env already exists — leaving it untouched"
fi

# 3) Agent identity (global SOUL.md) -----------------------------------------
if [ -f "$HERMES_HOME/SOUL.md" ]; then
  warn "existing $HERMES_HOME/SOUL.md found — NOT overwriting. Merge manually if desired."
else
  mkdir -p "$HERMES_HOME"
  cp config/SOUL.md "$HERMES_HOME/SOUL.md"
  say "installed SOUL.md -> $HERMES_HOME/SOUL.md"
fi

# 4) Apply recommended config (Phase 0 decisions) ----------------------------
say "applying recommended Hermes config..."
hermes config set model deepseek/deepseek-v4-pro
hermes config set terminal.backend local
hermes config set approvals.mode manual
hermes config set security.redact_secrets true
hermes config set security.tirith_enabled true
hermes config set checkpoints.enabled true
hermes config set code_execution.mode project
say "config applied. Review with: hermes config"

# 5) DeepSeek key -> ~/.hermes/.env (Item 1) --------------------------------
# Hermes reads secrets from ~/.hermes/.env. If the repo .env already has a key,
# forward it; otherwise tell the user the one command that puts it in the right
# place. We extract the value rather than sourcing .env (safer).
KEY_VAL="$(grep -E '^DEEPSEEK_API_KEY=.+' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  hermes config set DEEPSEEK_API_KEY "$DEEPSEEK_API_KEY"
  say "forwarded DEEPSEEK_API_KEY from environment -> $HERMES_HOME/.env"
elif [ -n "$KEY_VAL" ]; then
  hermes config set DEEPSEEK_API_KEY "$KEY_VAL"
  say "forwarded DEEPSEEK_API_KEY from .env -> $HERMES_HOME/.env"
else
  warn "No DEEPSEEK_API_KEY found. Set it where Hermes reads it:"
  warn "  hermes config set DEEPSEEK_API_KEY sk-..."
  warn "  (or put it in .env and re-run ./bootstrap.sh to forward it)"
fi

# 6) Register repo skills as a read-only external dir (Item 2) ---------------
# No copying => no drift. Curator only governs ~/.hermes/skills/, so repo skills
# stay outside its scope automatically (no pinning needed).
REPO_SKILLS="$REPO_DIR/skills"
if python3 - "$HERMES_HOME/config.yaml" "$REPO_SKILLS" <<'PY' 2>/dev/null
import sys, pathlib
try:
    import yaml
except Exception:
    sys.exit(3)
cfg_path, skills_dir = pathlib.Path(sys.argv[1]), sys.argv[2]
cfg_path.parent.mkdir(parents=True, exist_ok=True)
data = {}
if cfg_path.exists():
    data = yaml.safe_load(cfg_path.read_text()) or {}
skills = data.setdefault("skills", {})
ext = skills.get("external_dirs") or []
if not isinstance(ext, list):
    ext = [ext]
if skills_dir not in ext:
    ext.append(skills_dir)
    skills["external_dirs"] = ext
    cfg_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
    print("added")
else:
    print("present")
PY
then
  say "registered skills external_dir: $REPO_SKILLS"
else
  warn "could not auto-register skills external_dir (python/PyYAML missing?)."
  warn "  add this to $HERMES_HOME/config.yaml manually:"
  warn "    skills:"
  warn "      external_dirs:"
  warn "        - $REPO_SKILLS"
fi

# 7) Optional capability checks ----------------------------------------------
if command -v claude >/dev/null 2>&1; then
  say "Claude Code CLI detected — optional implementation lane available (see workflows/claude-code-lane.md)."
else
  warn "Claude Code CLI ('claude') not found — the optional coding lane is off until you install it."
fi

# 8) Optional: git pre-commit hook (Item 4) ----------------------------------
if [ -d .git ] && [ -f scripts/hooks/pre-commit ]; then
  say "git repo detected. To enable the pre-commit gate: make install-hooks"
fi

# Next steps ------------------------------------------------------------------
cat <<'NEXT'

Done. Next:
  1. If you didn't set the key above:  hermes config set DEEPSEEK_API_KEY sk-...
  1b. Lock the DeepSeek provider/model (authoritative): run `hermes setup`,
      pick DeepSeek, base URL https://api.deepseek.com, model deepseek-v4-pro.
      Then verify with `hermes model`.
  2. Fill in .hermes.md "Project facts" + docs/context.md + docs/architecture.md
  3. Fill the Makefile commands (test/lint/run/build) for your stack
  4. Run from the repo root:           hermes        (loads .hermes.md as the brain)
  5. Read the playbook:                GUIDE.md
NEXT
