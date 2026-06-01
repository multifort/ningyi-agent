# Optional: Messaging Gateway

**Off by default** (Phase 0). Enable only if you want to drive the project agent
from Telegram/Slack/Discord/etc., or have cron deliver reports to a channel.

## What it gives you
- Talk to the project's Hermes from a chat app (mobile/async access).
- Cron delivery to a channel (`--deliver telegram`, etc.).
- One gateway process serves many platforms.

## Cost / tradeoffs (why it's off by default)
- Extra credentials (bot tokens) and a long-running daemon to manage.
- Orthogonal to the core dev loop — the loop works fully from the CLI.

## To enable (sketch)
1. Create a bot on your platform and get its token.
2. Put the token in `~/.hermes/.env` (NOT in this repo).
3. Configure the platform block in `~/.hermes/config.yaml`.
4. `hermes gateway install` then `hermes gateway`.
See the Hermes messaging docs for per-platform setup. Keep tokens out of the repo.
