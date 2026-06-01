# automation/ — Scheduled work & skill hygiene

Three concerns:
- **cron-jobs.md** — recurring agent jobs (health, dependency/security audit,
  standup digest). Needs the gateway daemon running.
- **curator-policy.md** — keep the skill library clean without losing project skills.
- **gateway-optional.md** — messaging access. OFF by default (Phase 0 decision).

All of this is optional. The core dev loop works without any of it.
