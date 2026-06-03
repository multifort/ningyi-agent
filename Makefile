# Project: DeepSeek-style chat assistant — React (web/) + Node proxy (server/).
# These are the single source of truth for "how do I run/test/build this".
.DEFAULT_GOAL := help

WEB    := web
SERVER := server

# Commands for this stack (override on the CLI if your layout differs).
TEST_CMD  ?= npm --prefix $(WEB) run test --if-present -- --run && npm --prefix $(SERVER) run test --if-present
LINT_CMD  ?= npm --prefix $(WEB) run lint --if-present && npm --prefix $(SERVER) run lint --if-present
BUILD_CMD ?= npm --prefix $(WEB) run build

.PHONY: help install dev test lint fmt build review validate install-hooks hermes-health hermes-skills

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n",$$1,$$2}'

install: ## Install deps for web/ and server/
	@test -d $(WEB)    && npm --prefix $(WEB) install    || echo "skip: $(WEB)/ not created yet"
	@test -d $(SERVER) && npm --prefix $(SERVER) install || echo "skip: $(SERVER)/ not created yet"

dev: ## Run backend (:8787) + frontend (:5173) together (Ctrl-C stops both)
	@echo "starting server + web ..."
	@trap 'kill 0' INT TERM; \
	  ( npm --prefix $(SERVER) run dev ) & \
	  ( npm --prefix $(WEB) run dev ) & \
	  wait

test: ## Run the test suites (web + server)
	@$(TEST_CMD)

lint: ## Lint web/ and server/
	@$(LINT_CMD)

fmt: ## Format with Prettier (if configured)
	@npm --prefix $(WEB) run format --if-present
	@npm --prefix $(SERVER) run format --if-present

build: ## Build the frontend for production
	@$(BUILD_CMD)

review: lint test ## Quality gate used by definition-of-done (lint + test)
	@echo "✓ review gate passed (lint + test)"

validate: ## Validate the Hermes scaffold itself (config, skills, references)
	@scripts/validate.sh

hermes-health: ## Check whether the Hermes CLI is reachable for Agent mode
	@hermes --version >/dev/null 2>&1 && echo "✓ hermes available: $$(hermes --version | head -1)" || echo "✗ hermes CLI not found — Agent mode will degrade to Chat mode"

hermes-skills: ## List skills available to the app's Agent mode
	@hermes skills list 2>/dev/null | head -20 || echo "hermes CLI not available"

install-hooks: ## Install the git pre-commit hook
	@test -d .git || { echo "not a git repo"; exit 1; }
	@ln -sf ../../scripts/hooks/pre-commit .git/hooks/pre-commit
	@chmod +x scripts/hooks/pre-commit
	@echo "✓ installed .git/hooks/pre-commit"