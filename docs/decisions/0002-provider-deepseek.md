# 0002 — Use DeepSeek as the model provider

- **Status:** accepted (supersedes the provider choice in ADR 0001)
- **Date:** <fill in>

## Context
The Anthropic API key is not permitted for Hermes Agent to call in our setup, so
the original Anthropic provider choice (ADR 0001) is not usable. We need a capable,
available provider for orchestration and coding.

## Decision
Use Hermes' built-in **`deepseek`** provider.
- Model: `deepseek-v4-pro` (strong, low-cost coding/reasoning); `deepseek-chat` /
  `deepseek-reasoner` as alternatives. Confirm the exact string with `hermes model`.
- Base URL: `https://api.deepseek.com` (provider default).
- Key: `DEEPSEEK_API_KEY` in `~/.hermes/.env`. Note: the DeepSeek provider reads
  this env var ONLY and ignores `api_key` in `config.yaml` (known limitation).
- Set up via `hermes setup` → Quick Setup → DeepSeek (writes the version-correct
  config shape); `bootstrap.sh` forwards the key and sets the model best-effort.

## Consequences
- Much lower token cost than the original choice; strong coding performance.
- The optional **Claude Code lane** uses Anthropic and is independent of this
  provider; it stays optional and requires separate Claude access. Default
  implementation is Hermes-native (DeepSeek), with OpenAI-compatible coding CLIs
  as an alternative lane if desired.
- First-run verification must confirm the active model/provider (see VALIDATION.md).
