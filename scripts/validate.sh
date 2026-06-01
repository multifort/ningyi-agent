#!/usr/bin/env bash
# Static validation of the scaffold itself: config YAML, SKILL.md frontmatter,
# manifest references, bootstrap invariants, internal doc references, secret
# hygiene. Run by `make validate` and the pre-commit hook. No network needed.
set -uo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import sys, glob, re, pathlib
ok = True
def check(c, m):
    global ok; print(("  OK " if c else "FAIL ")+m); ok = ok and c
try:
    import yaml; H=True
except Exception:
    H=False; print("note: PyYAML missing — text-only checks")

cfg = pathlib.Path("config/hermes.config.snippet.yaml").read_text()
if H:
    d = yaml.safe_load(cfg)
    check("deepseek" in str(d.get("model","")), "config: model references deepseek")
    check(d.get("terminal",{}).get("backend")=="local", "config: terminal.backend = local")
else:
    check("deepseek" in cfg, "config: model references deepseek (text)")

skills = glob.glob("skills/*/SKILL.md")
check(len(skills)>=1, f"found {len(skills)} project SKILL.md")
for sf in sorted(skills):
    t = pathlib.Path(sf).read_text()
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    fm_ok = False
    if m:
        if H:
            y = yaml.safe_load(m.group(1)); fm_ok = all(y.get(k) for k in ("name","description","version"))
        else:
            fm_ok = all(k+":" in m.group(1) for k in ("name","description","version"))
    secs = all(s in t for s in ("## When to Use","## Procedure","## Pitfalls","## Verification"))
    check(bool(m) and fm_ok and secs, f"skill ok: {sf}")

man = pathlib.Path("skills/MANIFEST.md").read_text()
for s in ("project-spec","definition-of-done","project-release"):
    check(s in man, f"MANIFEST references {s}")

bs = pathlib.Path("bootstrap.sh").read_text()
check("deepseek/deepseek-v4-pro" in bs, "bootstrap: sets DeepSeek model")
check("external_dir" in bs, "bootstrap: registers skills external_dir")
check("DEEPSEEK_API_KEY" in bs and "hermes config set DEEPSEEK_API_KEY" in bs, "bootstrap: forwards DEEPSEEK_API_KEY to ~/.hermes/.env")

refs = ["docs/context.md","docs/architecture.md","docs/memory-conventions.md",
        "docs/specs/SPEC-template.md","docs/decisions/0000-record-template.md",
        "workflows/dev-loop.md","workflows/claude-code-lane.md","automation/cron-jobs.md",
        "automation/curator-policy.md","skills/MANIFEST.md",".hermes.md","AGENTS.md",
        "GUIDE.md","Makefile"]
for r in sorted(set(refs)):
    check(pathlib.Path(r).exists(), f"exists: {r}")

check(".env" in pathlib.Path(".gitignore").read_text(), ".gitignore ignores .env")
print("\nRESULT:", "PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
PY
