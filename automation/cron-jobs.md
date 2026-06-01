# Cron Jobs

Hermes has a built-in scheduler. Jobs are scheduled agent runs delivered to a
destination. **The gateway daemon must be running** for jobs to fire:
```
hermes gateway install      # install as a user service (recommended)
hermes cron status          # verify the scheduler
```

## Schedule formats (important)
Use cron expressions, intervals, relative delays, or ISO timestamps.
Natural language like "daily at 9am" is **not** supported — use `0 9 * * *`.
- `0 9 * * 1-5` weekdays 9am · `every 2h` interval · `30m` one-shot delay.

## Authoring rule
Cron runs start in a **fresh session**, so each prompt must be **self-contained**:
include repo path, the command to run, the output format, and explicit success
criteria. Output is saved under `~/.hermes/cron/output/<job-id>/`. Test before
trusting: `/cron run <job_id>`.

## Recommended jobs for a software project
Register with `hermes cron add "<schedule>" "<prompt>"` (or `/cron add ...`).

### 1. Weekday health check (08:45, Mon-Fri)
```
hermes cron add "45 8 * * 1-5" \
"In /path/to/repo: run the test suite and report PASS/FAIL with the failing test
names only. If everything passes, reply with a single line: 'green'."
```

### 2. Weekly dependency & security audit (Mon 06:00)
```
hermes cron add "0 6 * * 1" \
"In /path/to/repo: check for outdated and vulnerable dependencies using the
project's package manager. Produce a short report: package, current, latest,
severity. Do not modify anything."
```

### 3. Standup digest (weekdays 09:00)
```
hermes cron add "0 9 * * 1-5" \
"In /path/to/repo: review git log for the last 24h and draft a standup update —
done yesterday, planned today, blockers. Keep it under 8 bullets."
```

## Deterministic watchdogs (no LLM)
For checks where a script already prints the exact message (disk, heartbeat),
use script-only / `no_agent` mode — same scheduler, no tokens. Empty output = no
notification, ideal for quiet monitors.

## Delivery (only if gateway is configured)
Append `--deliver file:reports/`, `--deliver telegram`, etc. Default is local files.
